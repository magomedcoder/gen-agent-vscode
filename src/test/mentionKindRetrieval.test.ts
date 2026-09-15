import * as assert from 'assert';
import { estimateTextTokens } from '../core/llm/estimateTokens.js';
import { MENTION_KIND_TOKEN_QUOTAS, combineRetrievalScore, formatMentionHitBlock, packMentionHitsToQuota, packPastMessagesToQuota, rankMentionHits, scoreQueryRelevance, tokenizeQuery } from '../features/chat/mentionKindRetrieval.js';
import type { MentionRetrievalHit } from '../features/chat/mentionKindRetrieval.js';
suite('mentionKindRetrieval', () => {
	test('tokenizeQuery выделяет латиницу и кириллицу', () => {
		assert.deepStrictEqual(tokenizeQuery('Fix Auth / правка'), ['fix', 'auth', 'правка']);
		assert.ok(tokenizeQuery('a').length === 0);
	});

	test('scoreQueryRelevance ранжирует по overlap с query', () => {
		const high = scoreQueryRelevance('docs about authentication oauth', 'auth oauth');
		const low = scoreQueryRelevance('unrelated readme about styling', 'auth oauth');
		assert.ok(high > low);
		assert.ok(high > 0.5);
		assert.strictEqual(scoreQueryRelevance('anything', ''), 0);
		assert.strictEqual(scoreQueryRelevance('docs folder', 'docs'), 0);
	});

	test('combineRetrievalScore смешивает base и lexical', () => {
		const mixed = combineRetrievalScore(0.9, 'docs/auth.md', 'oauth flow', 'oauth');
		const weak = combineRetrievalScore(0.9, 'docs/style.md', 'colors', 'oauth');
		assert.ok(mixed > weak);
		assert.ok(mixed <= 1);
	});

	test('rankMentionHits сортирует по score desc, path asc', () => {
		const hits: MentionRetrievalHit[] = [
			{
				path: 'b.md',
				score: 0.5,
				snippet: 'b'
			},
			{
				path: 'a.md',
				score: 0.9,
				snippet: 'a'
			},
			{
				path: 'c.md',
				score: 0.9,
				snippet: 'c'
			},
		];
		const ranked = rankMentionHits(hits);
		assert.strictEqual(ranked[0]!.path, 'a.md');
		assert.strictEqual(ranked[1]!.path, 'c.md');
		assert.strictEqual(ranked[2]!.path, 'b.md');
	});

	test('packMentionHitsToQuota выкидывает низкий score при docs quota', () => {
		const hits: MentionRetrievalHit[] = [
			{
				path: 'high.md',
				score: 0.95,
				snippet: 'x'.repeat(6_000)
			},
			{
				path: 'mid.md',
				score: 0.5,
				snippet: 'y'.repeat(6_000)
			},
			{
				path: 'low.md',
				score: 0.1,
				snippet: 'z'.repeat(6_000)
			},
		];
		const total = hits.reduce((s, h) => s + estimateTextTokens(formatMentionHitBlock(h, 'Docs')), 0);
		assert.ok(total > MENTION_KIND_TOKEN_QUOTAS.docs);

		const packed = packMentionHitsToQuota(hits, 'docs', {
			kindTag: 'Docs' 
	});
		assert.ok(packed.truncated);
		assert.ok(packed.dropped.length >= 1);
		assert.ok(packed.kept[0]!.path === 'high.md');
		assert.ok(!packed.kept.some((h) => h.path === 'low.md') || packed.kept.length === 1);
		assert.ok(packed.tokensUsed <= packed.maxTokens || packed.kept.length === 1);
		assert.ok(packed.text.includes('[Docs high.md]'));
		assert.strictEqual(packed.maxTokens, MENTION_KIND_TOKEN_QUOTAS.docs);
	});

	test('packMentionHitsToQuota для terminals предпочитает релевантный буфер', () => {
		const hits: MentionRetrievalHit[] = [
			{
				path: 'build',
				score: 0.1, 
				snippet: 'npm run build ok'
			},
			{
				path: 'test',
				score: 0.95,
				snippet: 'FAIL auth.spec.ts AssertionError'
			},
			{
				path: 'idle',
				score: 0.05,
				snippet: '(нет буферизованного вывода)'
			},
		];
		const packed = packMentionHitsToQuota(hits, 'terminals', {
			kindTag: 'terminal',
			maxTokens: 400,
		});
		assert.strictEqual(packed.kept[0]!.path, 'test');
		assert.ok(packed.text.includes('[terminal test]'));
		assert.ok(packed.text.includes('FAIL auth'));
	});

	test('packPastMessagesToQuota держит хронологию и режет по quota', () => {
		const messages = [
			{
				role: 'user',
				content: 'hello world '.repeat(80)
			},
			{
				role: 'assistant',
				content: 'unrelated styling css '.repeat(80)
			},
			{ 
				role: 'user',
				content: 'fix authentication oauth please '.repeat(40)
			},
			{
				role: 'assistant',
				content: 'here is the oauth fix '.repeat(40)
			},
		];
		const packed = packPastMessagesToQuota(messages, 'oauth auth', {
			sessionTitle: 'Auth chat',
			maxTokens: 500,
		});
		assert.ok(packed.text.startsWith('[past Auth chat]'));
		assert.ok(packed.kept.length >= 1);
		assert.ok(packed.truncated || packed.tokensUsed <= 500 + 20);
		// Оставшиеся - в хронологическом порядке path index
		for (let i = 1; i < packed.kept.length; i += 1) {
			const prev = Number(packed.kept[i - 1]!.path.split('-').pop());
			const cur = Number(packed.kept[i]!.path.split('-').pop());
			assert.ok(cur >= prev);
		}
	});

	test('квоты per-kind заданы как prod-like константы', () => {
		assert.strictEqual(MENTION_KIND_TOKEN_QUOTAS.docs, 3_000);
		assert.strictEqual(MENTION_KIND_TOKEN_QUOTAS.past, 2_500);
		assert.strictEqual(MENTION_KIND_TOKEN_QUOTAS.terminals, 2_500);
	});
});
