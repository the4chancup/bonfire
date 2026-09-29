// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const sourcePath = fileURLToPath(new URL('../common/Constants.ts', import.meta.url));
const transformedSource = esbuild.transformSync(readFileSync(sourcePath, 'utf8'), {
	loader: 'ts',
	format: 'cjs',
	platform: 'node',
	target: 'node20',
}).code;

function loadConstants() {
	const module = {exports: {}};
	const context = vm.createContext({require, module, exports: module.exports});
	vm.runInContext(transformedSource, context, {filename: sourcePath});
	return module.exports;
}

describe('spellcheck dictionary download base url', () => {
	test('defaults to the jsDelivr npm mirror', () => {
		const {getSpellcheckDictionaryBaseUrl} = loadConstants();
		assert.equal(getSpellcheckDictionaryBaseUrl({}), 'https://cdn.jsdelivr.net/npm');
	});

	test('keeps the self-hosted CDN endpoint override with its dictionaries path', () => {
		const {getSpellcheckDictionaryBaseUrl} = loadConstants();
		assert.equal(
			getSpellcheckDictionaryBaseUrl({FLUXER_STATIC_CDN_ENDPOINT: 'https://static.example.com/'}),
			'https://static.example.com/desktop/spellcheck/dictionaries',
		);
	});

	test('prefers the explicit dictionary base url over everything', () => {
		const {getSpellcheckDictionaryBaseUrl} = loadConstants();
		assert.equal(
			getSpellcheckDictionaryBaseUrl({
				FLUXER_SPELLCHECK_DICTIONARY_BASE_URL: 'https://mirror.example.com/dicts',
				FLUXER_STATIC_CDN_ENDPOINT: 'https://static.example.com',
			}),
			'https://mirror.example.com/dicts',
		);
	});
});
