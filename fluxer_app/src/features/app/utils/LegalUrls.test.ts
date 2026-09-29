// SPDX-License-Identifier: AGPL-3.0-or-later

import {vi} from 'vitest';

vi.hoisted(() => {
	(globalThis as {window?: unknown}).window = {
		__FLUXER_BOOTSTRAP__: {
			instance: {
				api_code_version: 1,
				endpoints: {
					api: 'https://web.fluxer.app/api',
					api_client: 'https://web.fluxer.app/api',
					api_public: 'https://api.fluxer.app',
					gateway: '',
					media: '',
					static_cdn: '',
					marketing: 'https://fluxer.example.test',
					admin: '',
					invite: '',
					gift: '',
					webapp: '',
				},
				captcha: {provider: 'none', hcaptcha_site_key: null, turnstile_site_key: null},
			},
		},
	};
});

vi.mock('@lingui/core/macro', () => ({
	msg: (value: unknown) => value,
	defineMessage: (value: unknown) => value,
	t: (strings: TemplateStringsArray, ...values: Array<unknown>) => String.raw(strings, ...values),
	plural: () => '',
	select: () => '',
	selectOrdinal: () => '',
}));

import {Routes} from '@app/app/Routes';
import RuntimeConfig, {normalizeAppPublicConfig} from '@app/features/app/state/RuntimeConfig';
import {getCommunityGuidelinesUrl, getPrivacyUrl, getTermsUrl} from '@app/features/app/utils/LegalUrls';
import DeveloperOptions from '@app/features/devtools/state/DeveloperOptions';
import {runInAction} from 'mobx';
import {afterEach, describe, expect, it} from 'vitest';

const originalAppPublic = RuntimeConfig.appPublic;
const originalMarketingEndpoint = RuntimeConfig.marketingEndpoint;

afterEach(() => {
	runInAction(() => {
		DeveloperOptions.selfHostedModeOverride = false;
		RuntimeConfig.appPublic = originalAppPublic;
		RuntimeConfig.marketingEndpoint = originalMarketingEndpoint;
	});
});

function selfHosted(appPublic = normalizeAppPublicConfig()): void {
	runInAction(() => {
		DeveloperOptions.selfHostedModeOverride = true;
		RuntimeConfig.appPublic = appPublic;
		RuntimeConfig.marketingEndpoint = 'https://bonfire.implyingrigged.info';
	});
}

describe('help and legal URLs on self-hosted instances', () => {
	it('sends help, help articles and bug reports to the official help center', () => {
		selfHosted();

		expect(Routes.help()).toBe('https://fluxer.app/help');
		expect(Routes.helpArticle('attachment-expiry')).toBe('https://fluxer.app/help/attachment-expiry');
		expect(Routes.bugs()).toBe('https://fluxer.app/help/report-bug');
	});

	it('hides legal links the instance did not configure', () => {
		selfHosted();

		expect(getTermsUrl()).toBeNull();
		expect(getPrivacyUrl()).toBeNull();
		expect(getCommunityGuidelinesUrl()).toBeNull();
	});

	it('uses the legal URLs the instance configured', () => {
		selfHosted(
			normalizeAppPublicConfig({
				legal: {terms_url: 'https://example.test/terms', privacy_url: 'https://example.test/privacy'},
			}),
		);

		expect(getTermsUrl()).toBe('https://example.test/terms');
		expect(getPrivacyUrl()).toBe('https://example.test/privacy');
		expect(getCommunityGuidelinesUrl()).toBeNull();
	});
});

describe('help and legal URLs on the official instance', () => {
	it('keeps the marketing endpoint for help links and the built-in legal links', () => {
		runInAction(() => {
			DeveloperOptions.selfHostedModeOverride = false;
			RuntimeConfig.marketingEndpoint = 'https://fluxer.example.test';
		});

		expect(Routes.help()).toBe('https://fluxer.example.test/help');
		expect(Routes.helpArticle('attachment-expiry')).toBe('https://fluxer.example.test/help/attachment-expiry');
		expect(Routes.bugs()).toBe('https://fluxer.example.test/help/report-bug');
		expect(getTermsUrl()).toBe(Routes.terms());
		expect(getPrivacyUrl()).toBe(Routes.privacy());
		expect(getCommunityGuidelinesUrl()).toBe(Routes.guidelines());
	});
});
