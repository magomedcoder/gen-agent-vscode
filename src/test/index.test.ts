import * as assert from 'assert';
import { chunkFileContent } from '../features/index/chunk.js';
import { canSkipDirRewalk, recomputeDirDigests } from '../features/index/dirDigests.js';
import { contentHash } from '../features/index/hash.js';
import { buildTrigramIndex, searchTrigrams, tokenize } from '../features/index/trigram.js';
import type { IndexManifest } from '../features/index/types.js';
import { parseSymbolIndexJson, applySymbolPathUpdate, applySymbolPathRemove } from '../features/index/symbolIndexParse.js';

suite('contentHash', () => {
	test('стабильный sha256', () => {
		const a = contentHash('hello');
		const b = contentHash('hello');
		assert.notStrictEqual(a, 'hello');
		assert.strictEqual(a, b);
	});
});

suite('dirDigests', () => {
	test('пересчитывает Merkle digests по file hashes', () => {
		const digests = recomputeDirDigests({
			'src/a.ts': { 
				hash: 'h1'
			 },
			'src/b.ts': { 
				hash: 'h2'
			 },
			'README.md': { 
				hash: 'h3'
			 },
		});
		assert.ok(digests['']);
		assert.ok(digests['src']);
		assert.notStrictEqual(digests[''], digests['src']);

		const again = recomputeDirDigests({
			'src/a.ts': { 
				hash: 'h1' 
			},
			'src/b.ts': { 
				hash: 'h2' 
			},
			'README.md': { 
				hash: 'h3' 
			},
		});
		assert.strictEqual(digests['src'], again['src']);

		const changed = recomputeDirDigests({
			'src/a.ts': { 
				hash: 'h1-changed' 
			},
			'src/b.ts': { 
				hash: 'h2' 
			},
			'README.md': { 
				hash: 'h3' 
			},
		});
		assert.notStrictEqual(digests['src'], changed['src']);
	});

	test('canSkipDirRewalk при content-hash (или size+mtime)', () => {
		const files = {
			'src/a.ts': {
				hash: 'h1',
				size: 10,
				mtimeMs: 1000,
				chunkIds: [] as string[],
			},
			'src/b.ts': {
				hash: 'h2',
				size: 20,
				mtimeMs: 2000,
				chunkIds: [] as string[],
			},
		};
		const digests = recomputeDirDigests(files);
		const manifest: IndexManifest = {
			version: 1,
			updatedAt: '',
			files,
			chunks: {},
			trigrams: {},
			dirDigests: digests,
		};

		// Явный content-hash
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 10,
					contentHash: 'h1'
				},
				{
					relative: 'src/b.ts',
					size: 20,
					contentHash: 'h2'
				},
			]),
			true,
		);

		// size+mtime gate (доверенный stored hash)
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 10,
					mtimeMs: 1000
				},
				{
					relative: 'src/b.ts',
					size: 20,
					mtimeMs: 2000
				},
			]),
			true,
		);

		// Только size - недостаточно
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 10
				},
				{
					relative: 'src/b.ts',
					size: 20
				},
			]),
			false,
		);

		// Неверный hash
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 10,
					contentHash: 'h1-changed'
				},
				{
					relative: 'src/b.ts',
					size: 20,
					contentHash: 'h2'
				},
			]),
			false,
		);

		// size изменился
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 11,
					contentHash: 'h1'
				},
				{
					relative: 'src/b.ts',
					size: 20,
					contentHash: 'h2'
				},
			]),
			false,
		);

		// mtime изменился без contentHash
		assert.strictEqual(
			canSkipDirRewalk(manifest, 'src', [
				{
					relative: 'src/a.ts',
					size: 10,
					mtimeMs: 1001
				},
				{
					relative: 'src/b.ts',
					size: 20,
					mtimeMs: 2000
				},
			]),
			false,
		);
	});
});

suite('symbolIndex parse', () => {
	test('parseSymbolIndexJson читает валидный кэш', () => {
		const raw = JSON.stringify({
			updatedAt: '2026-01-01T00:00:00.000Z',
			fileCount: 1,
			symbols: [
				{ 
					name: 'Foo', 
					kind: 'class', 
					path: 'src/foo.ts', 
					startLine: 1, 
					endLine: 10 
				},
				{ 
					name: 1, 
					kind: 'bad', 
					path: 'x' 
				},
			],
		});
		const doc = parseSymbolIndexJson(raw);
		assert.ok(doc);
		assert.strictEqual(doc!.symbols.length, 1);
		assert.strictEqual(doc!.symbols[0]!.name, 'Foo');
	});

	test('parseSymbolIndexJson на мусоре -> undefined', () => {
		assert.strictEqual(parseSymbolIndexJson('{'), undefined);
		assert.strictEqual(parseSymbolIndexJson('{"symbols":null}'), undefined);
	});

	test('applySymbolPathUpdate / remove - per-file', () => {
		const doc = {
			updatedAt: '',
			fileCount: 2,
			symbols: [
				{
					name: 'Foo',
					kind: 'class',
					path: 'a.ts',
					startLine: 1,
					endLine: 2
				},
				{
					name: 'Bar',
					kind: 'function',
					path: 'b.ts',
					startLine: 1,
					endLine: 2
				},
			],
		};
		const updated = applySymbolPathUpdate(doc, 'a.ts', [
			{
				name: 'Foo2',
				kind: 'class',
				path: 'a.ts',
				startLine: 1,
				endLine: 9
			}
		], 8_000);
		assert.strictEqual(updated.symbols.find((s) => s.path === 'a.ts')?.name, 'Foo2');
		assert.ok(updated.symbols.some((s) => s.path === 'b.ts'));
		const removed = applySymbolPathRemove(updated, 'a.ts');
		assert.ok(!removed.symbols.some((s) => s.path === 'a.ts'));
		assert.strictEqual(removed.fileCount, 1);
	});
});

suite('chunkFileContent', () => {
	test('режет по function', () => {
		const src = [
			'function a() {',
			'  const x = 1;',
			'  const y = 2;',
			'  const z = 3;',
			'  return x + y + z;',
			'}',
			'',
			'function b() {',
			'  return 2;',
			'}',
		].join('\n');
		const chunks = chunkFileContent('src/a.ts', src);
		assert.ok(chunks.length >= 2);
		assert.strictEqual(chunks[0].path, 'src/a.ts');
		assert.ok(chunks.some((c) => c.text.includes('function a')));
		assert.ok(chunks.some((c) => c.text.includes('function b')));
	});

	test('пустой файл - без chunks', () => {
		assert.deepStrictEqual(chunkFileContent('empty.ts', '   \n  '), []);
	});
});

suite('trigram search', () => {
	test('находит chunk по токенам', () => {
		const chunks = chunkFileContent('lib/math.ts', 'export function add(a: number, b: number) {\n  return a + b;\n}\n');
		const trigrams = buildTrigramIndex(chunks);
		const manifest: IndexManifest = {
			version: 1,
			updatedAt: '',
			files: {},
			chunks: Object.fromEntries(chunks.map((c) => [c.id, c])),
			trigrams,
			dirDigests: {},
		};

		const hits = searchTrigrams(manifest, 'add number', 5);
		assert.ok(hits.length >= 1);
		assert.ok(hits[0].score > 0);
	});

	test('tokenize отбрасывает короткие слова', () => {
		assert.ok(tokenize('a bb ccc').includes('ccc'));
		assert.ok(!tokenize('a bb').includes('bb'));
	});
});
