// SPDX-License-Identifier: AGPL-3.0-or-later

import {createAdminApiKey} from '@app/api/admin/tests/AdminTestUtils';
import {
	createAuthHarness,
	createTestAccount,
	createUniqueUsername,
	loginUser,
	registerUser,
	setUserACLs,
} from '@app/api/auth/tests/AuthTestUtils';
import {
	acceptInvite,
	createChannel,
	createChannelInvite,
	createGuild,
	updateGuild,
} from '@app/api/guild/tests/GuildTestUtils';
import type {ApiTestHarness} from '@app/api/test/ApiTestHarness';
import {TEST_CREDENTIALS, TEST_USER_DATA} from '@app/api/test/TestConstants';
import {createBuilder, createBuilderWithoutAuth} from '@app/api/test/TestRequestBuilder';
import {DeletionReasons} from '@fluxer/constants/src/Core';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

interface ValidationErrorResponse {
	code: string;
	message: string;
	errors?: Array<{
		path: string;
		code: string;
		message: string;
	}>;
}

interface TemporaryPasswordResponse {
	password: string;
	username: string;
}

function registerBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		username: createUniqueUsername('bonfire'),
		global_name: TEST_USER_DATA.DEFAULT_GLOBAL_NAME,
		password: TEST_CREDENTIALS.STRONG_PASSWORD,
		date_of_birth: TEST_USER_DATA.DEFAULT_DATE_OF_BIRTH,
		consent: true,
		...overrides,
	};
}

describe('Bonfire account model', () => {
	let harness: ApiTestHarness;
	beforeAll(async () => {
		harness = await createAuthHarness();
	});
	beforeEach(async () => {
		await harness.reset();
	});
	afterAll(async () => {
		await harness?.shutdown();
	});

	describe('registration and login', () => {
		it('registers with username + password and gets discriminator 0', async () => {
			const reg = await registerUser(harness, registerBody());
			expect(reg.token).toBeTruthy();
			const me = await createBuilder<{username: string; discriminator: string | number}>(harness, reg.token)
				.get('/users/@me')
				.execute();
			expect(Number(me.discriminator)).toBe(0);
		});
		it('logs in with the username, case-insensitively', async () => {
			const account = await createTestAccount(harness);
			const login = await loginUser(harness, {email: account.username, password: account.password});
			expect('token' in login && login.token).toBeTruthy();
			const upper = await loginUser(harness, {
				email: account.username.toUpperCase(),
				password: account.password,
			});
			expect('token' in upper && upper.token).toBeTruthy();
		});
		it('rejects an email-shaped login value', async () => {
			await createTestAccount(harness);
			await createBuilderWithoutAuth(harness)
				.post('/auth/login')
				.body({email: 'someone@example.com', password: TEST_CREDENTIALS.STRONG_PASSWORD})
				.expect(400)
				.execute();
		});
		it('rejects a wrong password with INVALID_EMAIL_OR_PASSWORD', async () => {
			const account = await createTestAccount(harness);
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/login')
				.body({email: account.username, password: 'WrongPassword123'})
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.code === 'INVALID_EMAIL_OR_PASSWORD')).toBe(true);
		});
		it('rejects registration carrying an email field', async () => {
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/register')
				.body(registerBody({email: 'user@example.com'}))
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.path === 'email')).toBe(true);
		});
		it('requires a username', async () => {
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/register')
				.body(registerBody({username: undefined}))
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.path === 'username')).toBe(true);
		});
		it('requires a password', async () => {
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/register')
				.body(registerBody({password: undefined}))
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.path === 'password')).toBe(true);
		});
		it('rejects a username already taken with different case', async () => {
			const account = await createTestAccount(harness);
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/register')
				.body(registerBody({username: account.username.toUpperCase()}))
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.path === 'username' && e.code === 'TAG_ALREADY_TAKEN')).toBe(true);
		});
		it('rejects the reserved username DeletedUser', async () => {
			const json = await createBuilderWithoutAuth<ValidationErrorResponse>(harness)
				.post('/auth/register')
				.body(registerBody({username: 'DeletedUser'}))
				.expect(400)
				.execute();
			expect(json.errors?.some((e) => e.path === 'username' && e.code === 'TAG_ALREADY_TAKEN')).toBe(true);
		});
	});

	describe('username changes', () => {
		it('fails to rename to a taken username', async () => {
			const first = await createTestAccount(harness);
			const second = await createTestAccount(harness);
			await createBuilder(harness, second.token)
				.patch('/users/@me')
				.body({username: first.username.toUpperCase(), password: second.password})
				.expect(400)
				.execute();
		});
		it('allows a case-only rename of the own username', async () => {
			const account = await createTestAccount(harness);
			const renamed = account.username.toUpperCase();
			const me = await createBuilder<{username: string}>(harness, account.token)
				.patch('/users/@me')
				.body({username: renamed, password: account.password})
				.expect(200)
				.execute();
			expect(me.username).toBe(renamed);
		});
		it('rejects a non-zero discriminator', async () => {
			const account = await createTestAccount(harness);
			await createBuilder(harness, account.token)
				.patch('/users/@me')
				.body({discriminator: 1234, password: account.password})
				.expect(400)
				.execute();
		});
		it('renames a legacy non-zero discriminator account to #0000', async () => {
			// self-hosted keeps feature_custom_discriminator on; enable it via the admin route
			const admin = await setUserACLs(harness, await createTestAccount(harness), ['*']);
			const current = await createBuilder<{
				limit_config: {rules: Array<{id: string; filters: unknown; limits: Record<string, number>}>; traitDefinitions: Array<string>};
			}>(harness, admin.token)
				.get('/admin/limit-config')
				.expect(200)
				.execute();
			try {
				await createBuilder(harness, admin.token)
					.put('/admin/limit-config')
					.body({
						limit_config: {
							traitDefinitions: current.limit_config.traitDefinitions,
							rules: current.limit_config.rules.map((rule) => ({
								id: rule.id,
								filters: rule.filters,
								limits:
									rule.id === 'default'
										? {...rule.limits, feature_custom_discriminator: 1}
										: rule.limits,
							})),
						},
					})
					.expect(200)
					.execute();
				const account = await createTestAccount(harness);
				await createBuilderWithoutAuth(harness)
					.patch(`/test/users/${account.userId}/discriminator`)
					.body({discriminator: 8522})
					.expect(200)
					.execute();
				const newName = createUniqueUsername('legacyrename');
				const me = await createBuilder<{username: string; discriminator: string | number}>(harness, account.token)
					.patch('/users/@me')
					.body({username: newName, password: account.password})
					.expect(200)
					.execute();
				expect(me.username).toBe(newName);
				expect(Number(me.discriminator)).toBe(0);
				const meAfter = await createBuilder<{username: string; discriminator: string | number}>(harness, account.token)
					.get('/users/@me')
					.execute();
				expect(meAfter.username).toBe(newName);
				expect(Number(meAfter.discriminator)).toBe(0);
				const login = await loginUser(harness, {email: newName, password: account.password});
				expect('token' in login && login.token.length > 0).toBe(true);
			} finally {
				await createBuilder(harness, admin.token)
					.put('/admin/limit-config')
					.body({limit_config: current.limit_config})
					.execute();
			}
		});
	});

	describe('admin temporary password', () => {
		it('issues a new password, ends sessions, and refuses admin targets', async () => {
			const target = await createTestAccount(harness);
			const operator = await setUserACLs(harness, await createTestAccount(harness), ['*']);
			const apiKey = await createAdminApiKey(harness, operator, 'temp-password', ['user:update:email'], null);

			const response = await createBuilder<TemporaryPasswordResponse>(harness, apiKey.token)
				.post(`/admin/users/${target.userId}/temporary-password`)
				.body(null)
				.expect(200)
				.execute();
			expect(response.password).toBeTruthy();
			expect(response.username).toBe(target.username);

			await createBuilderWithoutAuth(harness)
				.post('/auth/login')
				.body({email: target.username, password: target.password})
				.expect(400)
				.execute();
			const relogin = await loginUser(harness, {email: target.username, password: response.password});
			expect('token' in relogin && relogin.token).toBeTruthy();
			await createBuilder(harness, target.token).get('/users/@me').expect(401).execute();

			const adminTarget = await setUserACLs(harness, await createTestAccount(harness), ['user:lookup']);
			await createBuilder(harness, apiKey.token)
				.post(`/admin/users/${adminTarget.userId}/temporary-password`)
				.body(null)
				.expect(403)
				.execute();
		});
	});

	describe('guild verification', () => {
		it('lets a password-bearing email-less member send a message in a LOW guild', async () => {
			const owner = await createTestAccount(harness);
			const member = await createTestAccount(harness);
			const guild = await createGuild(harness, owner.token, 'bonfire guild');
			await updateGuild(harness, owner.token, guild.id, {verification_level: 1});
			const channel = await createChannel(harness, owner.token, guild.id, 'general');
			const invite = await createChannelInvite(harness, owner.token, channel.id);
			await acceptInvite(harness, member.token, invite.code);
			const message = await createBuilder<{id: string}>(harness, member.token)
				.post(`/channels/${channel.id}/messages`)
				.body({content: 'hello bonfire'})
				.expect(200)
				.execute();
			expect(message.id).toBeTruthy();
		});
	});

	describe('report resolution', () => {
		it('delivers a system DM to an email-less reporter when an admin resolves with a public comment', async () => {
			const reporter = await createTestAccount(harness);
			const targetUser = await createTestAccount(harness);
			const admin = await setUserACLs(harness, await createTestAccount(harness), [
				'admin:authenticate',
				'report:resolve',
			]);
			const report = await createBuilder<{report_id: string}>(harness, reporter.token)
				.post('/reports/user')
				.body({user_id: targetUser.userId, category: 'harassment'})
				.expect(200)
				.execute();
			await createBuilder(harness, admin.token)
				.patch(`/admin/reports/${report.report_id}`)
				.body({status: 'resolved', public_comment: 'We actioned the account.'})
				.expect(200)
				.execute();
			const channels = await createBuilder<Array<{id: string; recipients?: Array<{id: string}>}>>(
				harness,
				reporter.token,
			)
				.get('/users/@me/channels')
				.expect(200)
				.execute();
			const systemChannels = channels.filter((channel) => channel.recipients?.some((r) => r.id === '0'));
			const messages = (
				await Promise.all(
					systemChannels.map((channel) =>
						createBuilder<Array<{id: string; content: string | null}>>(harness, reporter.token)
							.get(`/channels/${channel.id}/messages?limit=50`)
							.expect(200)
							.execute(),
					),
				)
			).flat();
			expect(messages).toHaveLength(1);
			expect(messages[0]?.content).toBeTruthy();
		});
	});

	describe('moderation deletion', () => {
		it('schedules deletion for an email-less user and invalidates their sessions', async () => {
			const admin = await setUserACLs(harness, await createTestAccount(harness), [
				'admin:authenticate',
				'user:delete',
			]);
			const target = await createTestAccount(harness);
			const before = await harness.requestJson({path: '/users/@me', headers: {Authorization: target.token}});
			expect(before.status).toBe(200);
			await createBuilder(harness, admin.token)
				.put(`/admin/users/${target.userId}/deletion`)
				.body({reason_code: DeletionReasons.SPAM, days_until_deletion: 60})
				.expect(200)
				.execute();
			const after = await harness.requestJson({path: '/users/@me', headers: {Authorization: target.token}});
			expect(after.status).toBe(401);
		});
	});
});
