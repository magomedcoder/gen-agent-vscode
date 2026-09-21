import * as assert from 'assert';
import { countActiveResearchJobs, researchJobsBusySummary, upsertResearchJob } from './researchJobs.js';
import type { ResearchJob } from './researchJobs.js';

suite('researchJobs helpers', () => {
	test('upsertResearchJob: создаёт job с defaults', () => {
		const next = upsertResearchJob([], {
			id: 'r1',
			status: 'running',
			subagent: 'explore',
			promptPreview: 'find auth',
		});
		assert.strictEqual(next.length, 1);
		const job = next[0]!;
		assert.strictEqual(job.id, 'r1');
		assert.strictEqual(job.status, 'running');
		assert.strictEqual(job.subagent, 'explore');
		assert.strictEqual(job.promptPreview, 'find auth');
		assert.ok(typeof job.startedAt === 'number');
		assert.strictEqual(job.finishedAt, undefined);
	});

	test('upsertResearchJob: обновляет существующий и сохраняет startedAt', () => {
		const started = 1_700_000_000_000;
		const initial: ResearchJob[] = [
			{
				id: 'r1',
				status: 'running',
				subagent: 'explore',
				promptPreview: 'a',
				startedAt: started,
			},
		];
		const next = upsertResearchJob(initial, {
			id: 'r1',
			status: 'done',
			reportSnippet: 'ok',
		});
		assert.strictEqual(next.length, 1);
		assert.strictEqual(next[0]!.status, 'done');
		assert.strictEqual(next[0]!.startedAt, started);
		assert.ok(typeof next[0]!.finishedAt === 'number');
		assert.strictEqual(next[0]!.reportSnippet, 'ok');
	});

	test('upsertResearchJob: не мутирует исходный массив', () => {
		const initial: ResearchJob[] = [];
		const next = upsertResearchJob(initial, {
			id: 'x',
			status: 'queued'
		});
		assert.strictEqual(initial.length, 0);
		assert.strictEqual(next.length, 1);
	});

	test('researchJobsBusySummary: undefined когда нет active', () => {
		assert.strictEqual(
			researchJobsBusySummary([
				{
					id: '1',
					status: 'done',
					subagent: 'explore',
					promptPreview: 'done'
				},
			]),
			undefined,
		);
	});

	test('researchJobsBusySummary: один running', () => {
		const summary = researchJobsBusySummary([
			{
				id: '1',
				status: 'running',
				subagent: 'scout',
				promptPreview: 'docs for OAuth flow and tokens',
			},
		]);
		assert.ok(summary);
		assert.ok(summary!.startsWith('research scout:'));
		assert.ok(summary!.includes('docs for OAuth'));
	});

	test('researchJobsBusySummary: несколько active', () => {
		const summary = researchJobsBusySummary([
			{
				id: '1',
				status: 'running',
				subagent: 'explore',
				promptPreview: 'a'
			},
			{
				id: '2',
				status: 'queued',
				subagent: 'scout',
				promptPreview: 'b'
			},
			{
				id: '3',
				status: 'done',
				subagent: 'general',
				promptPreview: 'c'
			},
		]);
		assert.strictEqual(summary, 'research *2 (explore, scout)');
	});

	test('countActiveResearchJobs считает running и queued', () => {
		assert.strictEqual(countActiveResearchJobs([]), 0);
		assert.strictEqual(
			countActiveResearchJobs([
				{
					id: '1',
					status: 'running',
					subagent: 'explore',
					promptPreview: 'a'
				},
				{
					id: '2',
					status: 'queued',
					subagent: 'scout',
					promptPreview: 'b'
				},
				{
					id: '3',
					status: 'error',
					subagent: 'explore',
					promptPreview: 'c'
				},
				{
					id: '4',
					status: 'aborted',
					subagent: 'explore',
					promptPreview: 'd'
				},
			]),
			2,
		);
	});
});
