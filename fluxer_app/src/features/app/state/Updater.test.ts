// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const AVAILABLE_VERSION = '2026.930.1837';
const AVAILABLE_SIZE = 169528083;

const nativeBridge = vi.hoisted(() => ({
	listener: null as null | ((event: unknown) => void),
	mode: 'available' as 'available' | 'not-available',
}));

const electronApi = vi.hoisted(() => ({
	platform: 'win32',
	onUpdaterEvent: vi.fn((callback: (event: unknown) => void) => {
		nativeBridge.listener = callback;
		return () => {
			nativeBridge.listener = null;
		};
	}),
	updaterCheck: vi.fn(async (context: string) => {
		nativeBridge.listener?.({type: 'checking', context});
		if (nativeBridge.mode === 'available') {
			nativeBridge.listener?.({
				type: 'available',
				context,
				version: AVAILABLE_VERSION,
				downloadSize: AVAILABLE_SIZE,
				downloadStarted: false,
			});
		} else {
			nativeBridge.listener?.({type: 'not-available', context});
		}
	}),
	updaterDownload: vi.fn(() => new Promise<never>(() => {})),
	updaterInstall: vi.fn(),
}));

const modalCommands = vi.hoisted(() => ({
	pushDesktopUpdateDownloadFailedModal: vi.fn(),
	pushDesktopUpdateInstallFailedModal: vi.fn(),
	pushManualUpdateAvailableModal: vi.fn(),
	pushNativeUpdateAvailableModal: vi.fn(),
	pushNativeUpdateDownloadingModal: vi.fn(),
	pushUnsupportedUpdateModal: vi.fn(),
	pushUpdateAvailableModal: vi.fn(),
	pushUpdateCheckFailedModal: vi.fn(),
	pushUpdateReadyModal: vi.fn(),
	pushUpToDateModal: vi.fn(),
}));

vi.mock('@lingui/core/macro', () => ({
	msg: (descriptor: {message: string}) => ({id: descriptor.message, message: descriptor.message}),
}));
vi.mock('@app/features/app/config/Config', () => ({default: {PUBLIC_BUILD_VERSION: '2026.929.235744'}}));
vi.mock('@app/features/updater/commands/UpdaterModalCommands', () => modalCommands);
vi.mock('@app/features/platform/utils/ClientInfo', () => ({
	getClientInfo: vi.fn(async () => ({
		desktopVersion: '2026.929.235744',
		desktopChannel: 'stable',
		desktopArch: 'x64',
	})),
}));
vi.mock('@app/features/ui/utils/NativeUtils', async (importOriginal) => {
	const original = await importOriginal<typeof import('@app/features/ui/utils/NativeUtils')>();
	return {
		...original,
		isElectron: () => true,
		getElectronAPI: () => electronApi,
		openExternalUrl: vi.fn(),
		downloadWithNative: vi.fn(async () => true),
	};
});
vi.mock('@app/features/platform/utils/AppLogger', () => ({
	Logger: class {
		debug = vi.fn();
		info = vi.fn();
		warn = vi.fn();
		error = vi.fn();
	},
}));

async function loadReadyUpdater() {
	vi.resetModules();
	const module = await import('@app/features/app/state/Updater');
	const updater = module.default;
	await vi.waitFor(() => {
		expect(nativeBridge.listener).not.toBeNull();
		expect(updater.lastCheckedAt).not.toBeNull();
	});
	return updater;
}

describe('Updater', () => {
	beforeEach(() => {
		nativeBridge.listener = null;
		nativeBridge.mode = 'available';
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('offers to start the download when a native update is available but not downloading', async () => {
		const updater = await loadReadyUpdater();

		await updater.checkForUpdates(true, true);

		expect(modalCommands.pushNativeUpdateAvailableModal).toHaveBeenCalledTimes(1);
		expect(modalCommands.pushNativeUpdateAvailableModal.mock.calls[0][0]).toBe(AVAILABLE_VERSION);
		expect(modalCommands.pushUpToDateModal).not.toHaveBeenCalled();

		const onDownload = modalCommands.pushNativeUpdateAvailableModal.mock.calls[0][1] as () => Promise<void>;
		void onDownload();
		await vi.waitFor(() => expect(electronApi.updaterDownload).toHaveBeenCalledWith('user'));
	});

	it('reports an in-flight download instead of staying silent', async () => {
		const updater = await loadReadyUpdater();

		await updater.checkForUpdates(true, true);
		const onDownload = modalCommands.pushNativeUpdateAvailableModal.mock.calls[0][1] as () => Promise<void>;
		void onDownload();
		await vi.waitFor(() => expect(electronApi.updaterDownload).toHaveBeenCalled());

		await updater.checkForUpdates(true, true);

		expect(modalCommands.pushNativeUpdateDownloadingModal).toHaveBeenCalledTimes(1);
	});

	it('still reports up-to-date when the native check finds nothing', async () => {
		nativeBridge.mode = 'not-available';
		const updater = await loadReadyUpdater();

		await updater.checkForUpdates(true, true);

		expect(modalCommands.pushUpToDateModal).toHaveBeenCalledTimes(1);
		expect(modalCommands.pushNativeUpdateAvailableModal).not.toHaveBeenCalled();
	});
});
