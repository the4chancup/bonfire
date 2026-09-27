// SPDX-License-Identifier: AGPL-3.0-or-later

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MentionReplyPreferences} from '@fluxer/constants/src/UserConstants';

let memberMentionFlags: number | null = null;
let userMentionFlags: number = MentionReplyPreferences.NO_PREFERENCE;

vi.mock('@app/features/member/state/GuildMembers', () => ({
	default: {
		getMember: (_guildId: string, _userId: string) =>
			memberMentionFlags === null ? null : {mentionFlags: memberMentionFlags},
	},
}));
vi.mock('@app/features/user/state/Users', () => ({
	default: {getUser: () => ({mentionFlags: userMentionFlags})},
}));

import {getDefaultReplyMention} from './MentionReplyPreferenceUtils';

describe('getDefaultReplyMention', () => {
	beforeEach(() => {
		memberMentionFlags = null;
		userMentionFlags = MentionReplyPreferences.NO_PREFERENCE;
	});
	it('defaults to no mention when the author has no preference and no fallback is given', () => {
		expect(getDefaultReplyMention({authorId: '1', isOwnMessage: false, guildId: 'g1'})).toBe(false);
	});
	it('honours a fallbackMention of true', () => {
		expect(getDefaultReplyMention({authorId: '1', isOwnMessage: false, guildId: 'g1', fallbackMention: true})).toBe(
			true,
		);
	});
	it('mentions when the author prefers mentions', () => {
		userMentionFlags = MentionReplyPreferences.PREFER_MENTION;
		expect(getDefaultReplyMention({authorId: '1', isOwnMessage: false, guildId: 'g1'})).toBe(true);
	});
	it("never mentions on the sender's own message", () => {
		userMentionFlags = MentionReplyPreferences.PREFER_MENTION;
		expect(getDefaultReplyMention({authorId: '1', isOwnMessage: true, guildId: 'g1'})).toBe(false);
	});
});
