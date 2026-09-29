// SPDX-License-Identifier: AGPL-3.0-or-later

export const APP_PROTOCOL = 'bonfire';
export const STABLE_APP_URL = 'https://bonfire.implyingrigged.info';
export const CANARY_APP_URL = 'https://bonfire.implyingrigged.info';
export const STABLE_MIGRATED_APP_ORIGIN = 'https://bonfire.implyingrigged.info';
export const CANARY_MIGRATED_APP_ORIGIN = 'https://bonfire.implyingrigged.info';
export const MIGRATED_APP_ENTRY_PATH = '/app';
export const PASSKEY_RP_IDS = ['bonfire.implyingrigged.info'] as const;
export const SPELLCHECK_DICTIONARY_MIRROR_URL = 'https://cdn.jsdelivr.net/npm';
export function getSpellcheckDictionaryBaseUrl(env: {
	FLUXER_SPELLCHECK_DICTIONARY_BASE_URL?: string;
	FLUXER_STATIC_CDN_ENDPOINT?: string;
}): string {
	const direct = env.FLUXER_SPELLCHECK_DICTIONARY_BASE_URL;
	if (direct) {
		return direct;
	}
	const endpoint = env.FLUXER_STATIC_CDN_ENDPOINT?.replace(/\/+$/, '');
	if (endpoint) {
		return `${endpoint}/desktop/spellcheck/dictionaries`;
	}
	return SPELLCHECK_DICTIONARY_MIRROR_URL;
}
export const DEFAULT_WINDOW_WIDTH = 1280;
export const DEFAULT_WINDOW_HEIGHT = 800;
export const MIN_WINDOW_WIDTH = 800;
export const MIN_WINDOW_HEIGHT = 600;
