// SPDX-License-Identifier: AGPL-3.0-or-later

import {BUILD_CHANNEL} from '@electron/common/BuildChannel';

export const DESKTOP_APP_NAME = BUILD_CHANNEL === 'canary' ? 'Bonfire Canary' : 'Bonfire';
export const MACOS_BUNDLE_ID = BUILD_CHANNEL === 'canary' ? 'app.bonfire.canary' : 'app.bonfire';
export const LINUX_DESKTOP_ENTRY_ID = BUILD_CHANNEL === 'canary' ? 'bonfire-canary' : 'bonfire';
export const WINDOWS_SHORTCUT_AUTHOR = 'the4chancup';
export const WINDOWS_VELOPACK_ID = BUILD_CHANNEL === 'canary' ? 'bonfire_desktop_canary' : 'bonfire_desktop';
export const WINDOWS_LEGACY_SQUIRREL_ID = 'fluxer_app';
export const WINDOWS_APP_USER_MODEL_ID =
	BUILD_CHANNEL === 'canary' ? 'the4chancup.Bonfire.Canary' : 'the4chancup.Bonfire';
export const WINDOWS_LEGACY_APP_USER_MODEL_IDS = [`velopack.${WINDOWS_VELOPACK_ID}`];
export const WINDOWS_TOAST_ACTIVATOR_CLSID =
	BUILD_CHANNEL === 'canary' ? '{87CF223F-5C5B-4230-8200-93095A0B0EDE}' : '{5B1AA354-AC5B-4DFD-A26D-CFD43992D825}';
