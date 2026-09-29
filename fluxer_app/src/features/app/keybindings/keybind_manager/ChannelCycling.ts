// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Walk an ordered channel list in the given direction, wrapping around the ends, and return the
 * first channel other than the current one that satisfies the predicate. When the current channel
 * is not in the list (for example when browsing direct messages) traversal starts before the first
 * entry going down, or after the last entry going up.
 */
export function findCycledChannel<T extends {id: string}>(
	channels: ReadonlyArray<T>,
	currentChannelId: string | null | undefined,
	predicate: (channel: T) => boolean,
	direction: 1 | -1,
): T | null {
	const count = channels.length;
	if (count === 0) return null;

	const currentIndex = currentChannelId ? channels.findIndex((channel) => channel.id === currentChannelId) : -1;
	const base = currentIndex === -1 ? (direction === 1 ? -1 : count) : currentIndex;

	for (let step = 1; step <= count; step++) {
		const candidate = channels[(base + direction * step + count * step) % count];
		if (candidate.id !== currentChannelId && predicate(candidate)) {
			return candidate;
		}
	}
	return null;
}
