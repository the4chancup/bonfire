// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createAuthHarness,
	createUniqueUsername,
	registerUser,
} from '@app/api/auth/tests/AuthTestUtils';
import {Config} from '@app/api/Config';
import type {ApiTestHarness} from '@app/api/test/ApiTestHarness';
import {HTTP_STATUS} from '@app/api/test/TestConstants';
import {createBuilderWithoutAuth} from '@app/api/test/TestRequestBuilder';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';

async function withCaptchaEnabled<T>(run: () => Promise<T>): Promise<T> {
	const previousEnabled = Config.captcha.enabled;
	const previousTestModeEnabled = Config.dev.testModeEnabled;
	Config.captcha.enabled = true;
	Config.dev.testModeEnabled = true;
	try {
		return await run();
	} finally {
		Config.captcha.enabled = previousEnabled;
		Config.dev.testModeEnabled = previousTestModeEnabled;
	}
}

async function registerAndFlag(
	harness: ApiTestHarness,
	flags: Array<string>,
): Promise<{username: string; password: string; userId: string}> {
	const password = 'a-strong-password';
	const username = createUniqueUsername('captchaflags');
	const reg = await registerUser(harness, {
		username,
		global_name: 'Captcha Flags User',
		password,
		date_of_birth: '2000-01-01',
		consent: true,
	});
	if (flags.length > 0) {
		await createBuilderWithoutAuth(harness)
			.post(`/test/users/${reg.user_id}/security-flags`)
			.body({set_flags: flags})
			.execute();
	}
	return {username, password, userId: reg.user_id};
}

describe('Auth Captcha Bypass Flags', () => {
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
	it('lets APP_STORE_REVIEWER accounts log in without solving a captcha', async () => {
		const account = await registerAndFlag(harness, ['APP_STORE_REVIEWER']);
		await withCaptchaEnabled(async () => {
			const resp = await createBuilderWithoutAuth<{token?: string; user_id?: string}>(harness)
				.post('/auth/login')
				.body({email: account.username, password: account.password})
				.execute();
			expect(resp.token).toBeTruthy();
			expect(resp.user_id).toBe(account.userId);
		});
	});
	it('still requires a captcha for accounts without the APP_STORE_REVIEWER flag', async () => {
		const account = await registerAndFlag(harness, []);
		await withCaptchaEnabled(async () => {
			await createBuilderWithoutAuth(harness)
				.post('/auth/login')
				.body({email: account.username, password: account.password})
				.expect(HTTP_STATUS.BAD_REQUEST, APIErrorCodes.CAPTCHA_REQUIRED)
				.execute();
		});
	});
});
