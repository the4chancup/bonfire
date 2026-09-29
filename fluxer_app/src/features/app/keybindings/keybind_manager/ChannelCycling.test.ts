// SPDX-License-Identifier: AGPL-3.0-or-later

import {findCycledChannel} from '@app/features/app/keybindings/keybind_manager/ChannelCycling';
import {describe, expect, it} from 'vitest';

type TestChannel = {id: string; guildId?: string};

function ch(id: string, guildId?: string): TestChannel {
	return {id, guildId};
}

const unread = (ids: Array<string>) => (channel: TestChannel) => ids.includes(channel.id);

describe('findCycledChannel', () => {
	it('finds the next matching channel later in the same guild', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1'), ch('g1c', 'g1')];
		expect(findCycledChannel(channels, 'g1a', unread(['g1c']), 1)).toEqual(ch('g1c', 'g1'));
	});

	it('crosses into the next guild when the current guild has no match', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1'), ch('g2a', 'g2'), ch('g2b', 'g2')];
		expect(findCycledChannel(channels, 'g1b', unread(['g2b']), 1)).toEqual(ch('g2b', 'g2'));
	});

	it('wraps around from the last guild back to the first', () => {
		const channels = [ch('g1a', 'g1'), ch('g2a', 'g2'), ch('g2b', 'g2')];
		expect(findCycledChannel(channels, 'g2a', unread(['g1a']), 1)).toEqual(ch('g1a', 'g1'));
	});

	it('crosses into the previous guild when cycling up', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1'), ch('g2a', 'g2')];
		expect(findCycledChannel(channels, 'g2a', unread(['g1b']), -1)).toEqual(ch('g1b', 'g1'));
	});

	it('starts below the current channel rather than at the top of the guild', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1'), ch('g1c', 'g1')];
		expect(findCycledChannel(channels, 'g1b', unread(['g1a', 'g1c']), 1)).toEqual(ch('g1c', 'g1'));
	});

	it('never returns the current channel even when it matches', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1')];
		expect(findCycledChannel(channels, 'g1a', unread(['g1a', 'g1b']), 1)).toEqual(ch('g1b', 'g1'));
		expect(findCycledChannel(channels, 'g1a', unread(['g1a']), 1)).toBeNull();
	});

	it('returns null when nothing matches', () => {
		const channels = [ch('g1a', 'g1'), ch('g2a', 'g2')];
		expect(findCycledChannel(channels, 'g1a', unread([]), 1)).toBeNull();
	});

	it('starts at the first channel going down when the current channel is not in the list', () => {
		const channels = [ch('g1a', 'g1'), ch('g1b', 'g1'), ch('g2a', 'g2')];
		expect(findCycledChannel(channels, 'dm1', unread(['g2a']), 1)).toEqual(ch('g2a', 'g2'));
		expect(findCycledChannel(channels, null, unread(['g1b']), 1)).toEqual(ch('g1b', 'g1'));
	});

	it('starts at the last channel going up when the current channel is not in the list', () => {
		const channels = [ch('g1a', 'g1'), ch('g2a', 'g2'), ch('g2b', 'g2')];
		expect(findCycledChannel(channels, 'dm1', unread(['g1a', 'g2a']), -1)).toEqual(ch('g2a', 'g2'));
	});

	it('returns null for an empty list', () => {
		expect(findCycledChannel([], 'x', unread(['x']), 1)).toBeNull();
	});
});
