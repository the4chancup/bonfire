// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {describe, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const sourcePath = fileURLToPath(new URL('./UpdaterDownloads.ts', import.meta.url));
const source = readFileSync(sourcePath, 'utf8');
const transformedSource = esbuild.transformSync(source, {
	loader: 'ts',
	format: 'cjs',
	platform: 'node',
	target: 'node20',
}).code;

const APPIMAGE_SHA256 = 'a'.repeat(64);
const DEB_SHA256 = 'b'.repeat(64);
const TAR_GZ_SHA256 = 'c'.repeat(64);

const RELEASE_TAG = 'desktop-v2026.910.101500';
const RELEASE_DL = `https://github.com/the4chancup/bonfire/releases/download/${RELEASE_TAG}`;

function loadUpdaterDownloads({channel = 'stable', platform = 'linux', arch = 'x64'} = {}) {
	function requireStub(specifier) {
		if (specifier === '@electron/common/BuildChannel') return {BUILD_CHANNEL: channel};
		throw new Error(`Unexpected import: ${specifier}`);
	}

	const module = {exports: {}};
	const context = vm.createContext({
		require: requireStub,
		module,
		exports: module.exports,
		process: {platform, arch},
	});
	vm.runInContext(transformedSource, context, {filename: sourcePath});
	return module.exports;
}

function latestInfo(version, files = {}) {
	return {version, pubDate: null, files};
}

describe('UpdaterDownloads Linux manual update options', () => {
	test('offers only the formats the manifest publishes, in preference order', () => {
		const {getManualDownloadOptions} = loadUpdaterDownloads();
		const info = latestInfo('2026.910.101500', {
			appimage: {
				url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x86_64.AppImage`,
				sha256: APPIMAGE_SHA256,
			},
			deb: {url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-amd64.deb`, sha256: DEB_SHA256},
			tar_gz: {
				url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x64.tar.gz`,
				sha256: TAR_GZ_SHA256,
			},
		});

		assert.deepEqual(structuredClone(getManualDownloadOptions(info)), [
			{
				format: 'appimage',
				label: 'AppImage',
				url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x86_64.AppImage`,
				suggestedName: 'Bonfire-2026.910.101500-linux-x86_64.AppImage',
				sha256: APPIMAGE_SHA256,
			},
			{
				format: 'deb',
				label: 'DEB package',
				url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-amd64.deb`,
				suggestedName: 'Bonfire-2026.910.101500-linux-amd64.deb',
				sha256: DEB_SHA256,
			},
			{
				format: 'tar_gz',
				label: 'tar.gz archive',
				url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x64.tar.gz`,
				suggestedName: 'Bonfire-2026.910.101500-linux-x64.tar.gz',
				sha256: TAR_GZ_SHA256,
			},
		]);
	});

	test('omits formats missing from the manifest entirely', () => {
		const {getManualDownloadOptions, getManualDownloadUrl} = loadUpdaterDownloads();
		const info = latestInfo('2026.910.101500', {
			deb: {url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-amd64.deb`, sha256: DEB_SHA256},
		});

		const options = structuredClone(getManualDownloadOptions(info));
		assert.deepEqual(
			options.map((option) => option.format),
			['deb'],
		);
		assert.equal(getManualDownloadUrl(info), `${RELEASE_DL}/Bonfire-2026.910.101500-linux-amd64.deb`);
	});

	test('takes the suggested file name from the last url path segment', () => {
		const {getManualDownloadOptions} = loadUpdaterDownloads();
		const info = latestInfo('2026.910.101500', {
			appimage: {url: `${RELEASE_DL}/Bonfire Custom Name.AppImage`, sha256: null},
		});

		const [appimage] = structuredClone(getManualDownloadOptions(info));
		assert.equal(appimage.suggestedName, 'Bonfire Custom Name.AppImage');
	});

	test('returns no options when the manifest publishes no Linux format', () => {
		const {getManualDownloadOptions} = loadUpdaterDownloads();
		const setup = {url: `${RELEASE_DL}/Bonfire-2026.910.101500-win-x64-setup.exe`, sha256: null};

		assert.equal(getManualDownloadOptions(latestInfo('2026.910.101500', {setup})).length, 0);
	});
});

describe('UpdaterDownloads manual download url', () => {
	test('prefers the first published format in Linux preference order', () => {
		const {getManualDownloadUrl} = loadUpdaterDownloads();
		const info = latestInfo('2026.910.101500', {
			deb: {url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-amd64.deb`, sha256: null},
			appimage: {url: `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x86_64.AppImage`, sha256: null},
		});

		assert.equal(getManualDownloadUrl(info), `${RELEASE_DL}/Bonfire-2026.910.101500-linux-x86_64.AppImage`);
	});

	test('falls back to the response file urls in format order on macOS', () => {
		const {getManualDownloadOptions, getManualDownloadUrl} = loadUpdaterDownloads({platform: 'darwin', arch: 'arm64'});
		const dmg = {url: `${RELEASE_DL}/Bonfire-2026.910.101500.dmg`, sha256: null};
		const zip = {url: `${RELEASE_DL}/Bonfire-2026.910.101500-mac.zip`, sha256: null};

		assert.equal(getManualDownloadOptions(latestInfo('2026.910.101500', {dmg, zip})).length, 0);
		assert.equal(getManualDownloadUrl(latestInfo('2026.910.101500', {zip, dmg})), dmg.url);
		assert.equal(getManualDownloadUrl(latestInfo('2026.910.101500', {zip})), zip.url);
	});

	test('falls back to the setup file url on Windows', () => {
		const {getManualDownloadOptions, getManualDownloadUrl} = loadUpdaterDownloads({platform: 'win32'});
		const setup = {url: `${RELEASE_DL}/Bonfire-2026.910.101500-win-x64-setup.exe`, sha256: null};

		assert.equal(getManualDownloadOptions(latestInfo('2026.910.101500', {setup})).length, 0);
		assert.equal(getManualDownloadUrl(latestInfo('2026.910.101500', {setup})), setup.url);
	});

	test('falls back to the download page when no file resolves', () => {
		const stable = loadUpdaterDownloads({channel: 'stable', platform: 'darwin'});
		const canary = loadUpdaterDownloads({channel: 'canary', platform: 'win32'});

		assert.equal(
			stable.getManualDownloadUrl(latestInfo('2026.910.101500')),
			'https://github.com/the4chancup/bonfire/releases',
		);
		assert.equal(
			canary.getManualDownloadUrl(latestInfo('2026.910.101500')),
			'https://github.com/the4chancup/bonfire/releases',
		);
	});
});

describe('UpdaterDownloads release page url', () => {
	test('points at the version tag page', () => {
		const {buildReleasePageUrl} = loadUpdaterDownloads();
		assert.equal(
			buildReleasePageUrl('2026.910.101500'),
			'https://github.com/the4chancup/bonfire/releases/tag/desktop-v2026.910.101500',
		);
	});
});
