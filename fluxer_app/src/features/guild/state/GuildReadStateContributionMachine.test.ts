// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	type GuildReadStateContributionInput,
	resolveGuildReadStateContribution,
} from '@app/features/guild/state/GuildReadStateContributionMachine';
import {MessageNotifications} from '@fluxer/constants/src/NotificationConstants';
import {describe, expect, it} from 'vitest';

function contribution(overrides: Partial<GuildReadStateContributionInput> = {}) {
	return resolveGuildReadStateContribution({
		isEligibleTextChannel: true,
		isPrivate: false,
		unreadBadgesLevel: null,
		isMutedForUnread: false,
		hasUnread: true,
		mentionCount: 0,
		...overrides,
	});
}

describe('resolveGuildReadStateContribution', () => {
	it('counts an unmuted unread channel towards the guild dot', () => {
		expect(contribution()).toEqual({mentionAllowed: false, unreadAllowed: true, mentionCount: 0});
	});

	it('skips muted channels for unread but still counts their mentions', () => {
		expect(contribution({isMutedForUnread: true, mentionCount: 3})).toEqual({
			mentionAllowed: true,
			unreadAllowed: false,
			mentionCount: 3,
		});
		expect(contribution({unreadBadgesLevel: MessageNotifications.NO_MESSAGES, mentionCount: 2})).toEqual({
			mentionAllowed: true,
			unreadAllowed: false,
			mentionCount: 2,
		});
	});

	it('skips mention-only channels for unread while allowing their badge', () => {
		expect(contribution({unreadBadgesLevel: MessageNotifications.ONLY_MENTIONS, mentionCount: 1})).toEqual({
			mentionAllowed: true,
			unreadAllowed: false,
			mentionCount: 1,
		});
	});

	it('never counts voice or otherwise ineligible channels', () => {
		expect(contribution({isEligibleTextChannel: false, mentionCount: 5})).toEqual({
			mentionAllowed: false,
			unreadAllowed: false,
			mentionCount: 5,
		});
	});

	it('requires actual unread or mentions', () => {
		expect(contribution({hasUnread: false})).toEqual({
			mentionAllowed: false,
			unreadAllowed: false,
			mentionCount: 0,
		});
		expect(contribution({mentionCount: 0}).mentionAllowed).toBe(false);
	});
});
