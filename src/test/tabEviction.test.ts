import * as assert from 'node:assert/strict';
import { pickTabsToEvict } from '../features/chat/tabEviction.js';

suite('tabEviction', () => {
	const sessions = [
		{ id: 'a', updatedAt: 100 },
		{ id: 'b', updatedAt: 200 },
		{ id: 'c', updatedAt: 300 },
	];

	test('block -> никогда не выселяет', () => {
		assert.deepEqual(
			pickTabsToEvict({
				sessions,
				busyIds: new Set(),
				currentId: 'c',
				maxTabs: 2,
				policy: 'block',
			}),
			[],
		);
	});

	test('closeOldestIdle: выселяет самые старые idle, не current/busy', () => {
		assert.deepEqual(
			pickTabsToEvict({
				sessions,
				busyIds: new Set(['a']),
				currentId: 'c',
				maxTabs: 2,
				needSlots: 1,
				policy: 'closeOldestIdle',
			}),
			['b'],
		);
	});

	test('closeOldestIdle: несколько слотов (oldest first)', () => {
		assert.deepEqual(
			pickTabsToEvict({
				sessions: [
					{ id: 'd', updatedAt: 50 },
					{ id: 'a', updatedAt: 100 },
					{ id: 'b', updatedAt: 200 },
					{ id: 'c', updatedAt: 300 },
				],
				busyIds: new Set(),
				currentId: 'c',
				maxTabs: 2,
				needSlots: 1,
				policy: 'closeOldestIdle',
			}),
			['d', 'a', 'b'],
		);
	});

	test('если все busy/current - пусто (caller блокирует)', () => {
		assert.deepEqual(
			pickTabsToEvict({
				sessions,
				busyIds: new Set(['a', 'b']),
				currentId: 'c',
				maxTabs: 2,
				policy: 'closeOldestIdle',
			}),
			[],
		);
	});

	test('уже есть место - пусто', () => {
		assert.deepEqual(
			pickTabsToEvict({
				sessions,
				busyIds: new Set(),
				currentId: 'c',
				maxTabs: 10,
				policy: 'closeOldestIdle',
			}),
			[],
		);
	});
});
