// SPDX-License-Identifier: AGPL-3.0-or-later

import {create} from '@bufbuild/protobuf';
import {SoundSettingsSchema} from '@fluxer/schema/src/gen/fluxer/user/preferences/v1/pickers_pb';
import {describe, expect, it} from 'vitest';
import {
	DEFAULT_ALL_SOUNDS_DISABLED,
	DEFAULT_MASTER_VOLUME,
	soundSettingsFromMessage,
	soundSettingsToMessage,
	type SoundSettings,
} from './SoundSettingsSync';

function settings(overrides: Partial<SoundSettings> = {}): SoundSettings {
	return {
		allSoundsDisabled: DEFAULT_ALL_SOUNDS_DISABLED,
		disabledSounds: {},
		masterVolume: DEFAULT_MASTER_VOLUME,
		soundOverrides: {},
		...overrides,
	};
}

describe('sound settings sync', () => {
	it('defaults allSoundsDisabled to true for an empty message', () => {
		expect(soundSettingsFromMessage(create(SoundSettingsSchema)).allSoundsDisabled).toBe(true);
	});
	it('serializes an explicit false', () => {
		expect(soundSettingsToMessage(settings({allSoundsDisabled: false})).allSoundsDisabled).toBe(false);
	});
	it('leaves allSoundsDisabled unset when it equals the default', () => {
		expect(soundSettingsToMessage(settings({allSoundsDisabled: true})).allSoundsDisabled).toBeUndefined();
	});
	it('round-trips both values stably', () => {
		for (const value of [true, false]) {
			const first = soundSettingsToMessage(
				soundSettingsFromMessage(
					create(SoundSettingsSchema, soundSettingsToMessage(settings({allSoundsDisabled: value}))),
				),
			);
			expect(first.allSoundsDisabled ?? DEFAULT_ALL_SOUNDS_DISABLED).toBe(value);
			const second = soundSettingsToMessage(soundSettingsFromMessage(create(SoundSettingsSchema, first)));
			expect(second).toEqual(first);
		}
	});
});
