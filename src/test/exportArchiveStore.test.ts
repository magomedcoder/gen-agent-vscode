import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExtensionContext } from 'vscode';
import { deleteExportArchive, exportArchiveExists, loadExportArchive, saveExportArchive } from '../features/chat/exportArchiveStore.js';
import type { ChatUiMessage } from '../features/chat/protocol.js';

function fakeContext(storageFsPath: string): ExtensionContext {
	return {
		storageUri: { fsPath: storageFsPath } as ExtensionContext['storageUri'],
	} as ExtensionContext;
}

suite('exportArchiveStore', () => {
	let tmp: string;

	suiteSetup(async () => {
		tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'gen-archive-'));
	});

	suiteTeardown(async () => {
		await fs.rm(tmp, {
			recursive: true,
			force: true
		});
	});

	test('save / load / delete roundtrip', async () => {
		const ctx = fakeContext(tmp);
		const messages: ChatUiMessage[] = [
			{
				id: '1',
				role: 'user',
				content: 'hi'
			},
			{
				id: '2',
				role: 'assistant',
				content: 'hello'
			},
		];
		await saveExportArchive(ctx, 'sess-a', messages);
		assert.equal(await exportArchiveExists(ctx, 'sess-a'), true);

		const loaded = await loadExportArchive(ctx, 'sess-a');
		assert.ok(loaded);
		assert.equal(loaded!.length, 2);
		assert.equal(loaded![0]!.content, 'hi');

		await deleteExportArchive(ctx, 'sess-a');
		assert.equal(await exportArchiveExists(ctx, 'sess-a'), false);
		assert.equal(await loadExportArchive(ctx, 'sess-a'), undefined);
	});

	test('missing storageUri - no throw', async () => {
		const ctx = { storageUri: undefined } as ExtensionContext;
		await saveExportArchive(ctx, 'x', [
			{
				id: '1',
				role: 'user',
				content: 'a'
			}
		]);
		assert.equal(await loadExportArchive(ctx, 'x'), undefined);
		await deleteExportArchive(ctx, 'x');
	});
});
