// SPDX-License-Identifier: AGPL-3.0-or-later

import {Config} from '@app/api/Config';
import {Logger} from '@app/api/Logger';
import type {LimitConfigService} from '@app/api/limits/LimitConfigService';
import {resolveLimitSafe} from '@app/api/limits/LimitConfigUtils';
import {createLimitMatchContext} from '@app/api/limits/LimitMatchContextBuilder';
import type {User} from '@app/api/models/User';
import type {IUserRepository} from '@app/api/user/IUserRepository';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {BadRequestError} from '@fluxer/errors/src/domains/core/BadRequestError';
import type {ICacheService} from '@pkgs/cache/src/ICacheService';
import {ms, seconds} from 'itty-time';

interface GenerateDiscriminatorParams {
	username: string;
	requestedDiscriminator?: number;
	user?: User | null;
}

interface GenerateDiscriminatorResult {
	discriminator: number;
	available: boolean;
}

interface ResolveUsernameChangeParams {
	currentUsername: string;
	currentDiscriminator: number;
	newUsername: string;
	user?: User | null;
	requestedDiscriminator?: number;
}

interface ResolveUsernameChangeResult {
	username: string;
	discriminator: number;
}

export class UsernameNotAvailableError extends BadRequestError {
	constructor() {
		super({code: APIErrorCodes.USERNAME_NOT_AVAILABLE});
		this.name = 'UsernameNotAvailableError';
	}
}

export interface IDiscriminatorService {
	generateDiscriminator(params: GenerateDiscriminatorParams): Promise<GenerateDiscriminatorResult>;
	isDiscriminatorAvailableForUsername(username: string, discriminator: number): Promise<boolean>;
	resolveUsernameChange(params: ResolveUsernameChangeParams): Promise<ResolveUsernameChangeResult>;
}

export class DiscriminatorService implements IDiscriminatorService {
	private static readonly LOCK_TTL_MS = ms('5 seconds');
	private static readonly LOCK_RETRY_DELAY_MS = 50;
	private static readonly LOCK_MAX_WAIT_MS = ms('10 seconds');
	private static readonly DISCRIM_CACHE_TTL_S = seconds('30 seconds');

	constructor(
		private userRepository: IUserRepository,
		private cacheService: ICacheService,
		private limitConfigService: LimitConfigService,
	) {}

	private async canUseCustomDiscriminator(user?: User | null): Promise<boolean> {
		if (Config.instance.selfHosted) {
			return true;
		}
		if (!user) {
			return false;
		}
		const ctx = createLimitMatchContext({user});
		const hasCustomDiscriminator = resolveLimitSafe(
			this.limitConfigService.getConfigSnapshot(),
			ctx,
			'feature_custom_discriminator',
			0,
		);
		return hasCustomDiscriminator > 0;
	}

	async generateDiscriminator(params: GenerateDiscriminatorParams): Promise<GenerateDiscriminatorResult> {
		const {username, requestedDiscriminator, user} = params;
		if (requestedDiscriminator !== undefined && requestedDiscriminator !== 0) {
			return {discriminator: requestedDiscriminator, available: false};
		}
		const usernameLower = username.toLowerCase();
		const lockKey = `discrim-lock:${usernameLower}`;
		const lockToken = await this.acquireLockWithRetry(lockKey);
		if (!lockToken) {
			return {discriminator: -1, available: false};
		}
		try {
			if (!(await this.isUsernameFree(usernameLower, user))) {
				return {discriminator: 0, available: false};
			}
			await this.cacheClaimedDiscriminator(usernameLower, 0);
			return {discriminator: 0, available: true};
		} finally {
			await this.releaseLock(lockKey, lockToken);
		}
	}

	async isDiscriminatorAvailableForUsername(username: string, discriminator: number): Promise<boolean> {
		if (discriminator !== 0) {
			return false;
		}
		const usernameLower = username.toLowerCase();
		const lockKey = `discrim-lock:${usernameLower}`;
		const lockToken = await this.acquireLockWithRetry(lockKey);
		if (!lockToken) {
			return false;
		}
		try {
			return await this.isUsernameFree(usernameLower, null);
		} finally {
			await this.releaseLock(lockKey, lockToken);
		}
	}

	async resolveUsernameChange(params: ResolveUsernameChangeParams): Promise<ResolveUsernameChangeResult> {
		const {currentUsername, currentDiscriminator, newUsername, user, requestedDiscriminator} = params;
		if (
			currentUsername.toLowerCase() === newUsername.toLowerCase() &&
			(requestedDiscriminator === undefined || requestedDiscriminator === currentDiscriminator)
		) {
			return {username: newUsername, discriminator: currentDiscriminator};
		}
		const allowCustomDiscriminator = await this.canUseCustomDiscriminator(user);
		const discriminatorToRequest = allowCustomDiscriminator ? requestedDiscriminator : undefined;
		const result = await this.generateDiscriminator({
			username: newUsername,
			requestedDiscriminator: discriminatorToRequest,
			user,
		});
		if (!result.available || result.discriminator === -1) {
			throw new UsernameNotAvailableError();
		}
		return {username: newUsername, discriminator: result.discriminator};
	}

	private async acquireLockWithRetry(lockKey: string): Promise<string | null> {
		const startTime = Date.now();
		while (Date.now() - startTime < DiscriminatorService.LOCK_MAX_WAIT_MS) {
			const token = await this.acquireLock(lockKey);
			if (token) {
				return token;
			}
			try {
				await this.sleep(DiscriminatorService.LOCK_RETRY_DELAY_MS);
			} catch (error) {
				Logger.error({lockKey, error}, 'Error during lock retry sleep');
				return null;
			}
		}
		return null;
	}

	private async acquireLock(lockKey: string): Promise<string | null> {
		try {
			const ttlSeconds = Math.ceil(DiscriminatorService.LOCK_TTL_MS / 1000);
			return await this.cacheService.acquireLock(lockKey, ttlSeconds);
		} catch (error) {
			Logger.error({lockKey, error}, 'Failed to acquire discriminator lock');
			return null;
		}
	}

	private async releaseLock(lockKey: string, token: string): Promise<void> {
		try {
			await this.cacheService.releaseLock(lockKey, token);
		} catch (error) {
			Logger.error({lockKey, error}, 'Failed to release discriminator lock');
		}
	}

	private async isUsernameFree(usernameLower: string, user?: User | null): Promise<boolean> {
		const caller = user != null && user.username.toLowerCase() === usernameLower ? user : null;
		if (caller === null && (await this.getCachedDiscriminators(usernameLower)).size > 0) {
			return false;
		}
		const holders = await this.userRepository.findDiscriminatorsByUsername(usernameLower);
		if (holders.size === 0) {
			return true;
		}
		return caller !== null && holders.size === 1 && holders.has(caller.discriminator);
	}

	private async cacheClaimedDiscriminator(username: string, discriminator: number): Promise<void> {
		const cacheKey = `discrim-claimed:${username}`;
		await this.cacheService.sadd(cacheKey, discriminator.toString(), DiscriminatorService.DISCRIM_CACHE_TTL_S);
	}

	private async getCachedDiscriminators(username: string): Promise<Set<number>> {
		const cacheKey = `discrim-claimed:${username}`;
		const members = await this.cacheService.smembers(cacheKey);
		const discriminators = new Set<number>();
		for (const member of members) {
			const discrim = parseInt(member, 10);
			if (!Number.isNaN(discrim)) {
				discriminators.add(discrim);
			}
		}
		return discriminators;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				try {
					resolve();
				} catch (error) {
					reject(error);
				}
			}, ms);
			timeout.unref?.();
		});
	}
}
