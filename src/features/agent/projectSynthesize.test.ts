import * as assert from 'assert';
import { formatResearchAggregateMarkdown } from './projectSynthesize.js';

suite('formatResearchAggregateMarkdown', () => {
	test('пустой results - только заголовок Aggregate', () => {
		const md = formatResearchAggregateMarkdown([]);
		assert.strictEqual(md, '## Aggregate\n');
	});

	test('ok и fail jobs в markdown', () => {
		const md = formatResearchAggregateMarkdown([
			{
				ok: true,
				jobId: 'research-1',
				subagent: 'explore',
				report: 'found auth.ts',
			},
			{
				ok: false,
				jobId: 'research-2',
				subagent: 'scout',
				error: 'timeout',
			},
		]);
		assert.ok(md.includes('## Aggregate'));
		assert.ok(md.includes('### 1. explore (`research-1`) - ok'));
		assert.ok(md.includes('found auth.ts'));
		assert.ok(md.includes('### 2. scout (`research-2`) - fail'));
		assert.ok(md.includes('timeout'));
	});

	test('пустой report / error - плейсхолдеры', () => {
		const md = formatResearchAggregateMarkdown([
			{
				ok: true,
				jobId: 'a',
				subagent: 'explore'
			},
			{
				ok: false,
				jobId: 'b',
				subagent: 'scout'
			},
		]);
		assert.ok(md.includes('(empty)'));
		assert.ok(md.includes('error'));
	});
});
