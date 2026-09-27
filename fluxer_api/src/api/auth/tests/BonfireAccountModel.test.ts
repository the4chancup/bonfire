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
});
