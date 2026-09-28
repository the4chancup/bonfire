// SPDX-License-Identifier: AGPL-3.0-or-later

import type {SoundType} from '@app/features/notification/utils/SoundUtils';
import type {SoundSettings as SoundSettingsMessage} from '@fluxer/schema/src/gen/fluxer/user/preferences/v1/pickers_pb';

export const DEFAULT_ALL_SOUNDS_DISABLED = true;
export const DEFAULT_MASTER_VOLUME = 100;

export interface SoundSettings {
	allSoundsDisabled: boolean;
	disabledSounds: Partial<Record<SoundType, boolean>>;
	masterVolume: number;
	soundOverrides: Partial<Record<SoundType, number>>;
}

export function soundSettingsToMessage(settings: SoundSettings): {
	allSoundsDisabled?: boolean;
	masterVolume?: number;
	disabledSounds: Record<string, boolean>;
	soundOverrides: Record<string, number>;
} {
	const init: {
		allSoundsDisabled?: boolean;
		masterVolume?: number;
		disabledSounds: Record<string, boolean>;
		soundOverrides: Record<string, number>;
	} = {
		disabledSounds: {...settings.disabledSounds} as Record<string, boolean>,
		soundOverrides: {...settings.soundOverrides} as Record<string, number>,
	};
	if (settings.allSoundsDisabled !== DEFAULT_ALL_SOUNDS_DISABLED) {
		init.allSoundsDisabled = settings.allSoundsDisabled;
	}
	if (settings.masterVolume !== DEFAULT_MASTER_VOLUME) {
		init.masterVolume = settings.masterVolume;
	}
	return init;
}

export function soundSettingsFromMessage(m: SoundSettingsMessage): SoundSettings {
	return {
		allSoundsDisabled: m.allSoundsDisabled ?? DEFAULT_ALL_SOUNDS_DISABLED,
		masterVolume: m.masterVolume ?? DEFAULT_MASTER_VOLUME,
		disabledSounds: {...m.disabledSounds} as Partial<Record<SoundType, boolean>>,
		soundOverrides: {...m.soundOverrides} as Partial<Record<SoundType, number>>,
	};
}
