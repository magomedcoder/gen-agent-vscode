import * as assert from 'assert';
import { registerBuiltins } from '../builtins.js';
import { getToolByName } from '../registry.js';
import type { TaskToolContext } from './taskShell.js';

type SkipConfirmCtx = TaskToolContext & { skipConfirm?: boolean };

suite('task tool parallel smoke', () => {
	suiteSetup(() => {
		registerBuiltins();
	});

	test('prompts[] + mutating без allow_mutating_parallel - reject', async () => {
		const tool = getToolByName('task');
		assert.ok(tool);
		const ctx: SkipConfirmCtx = {
			skipConfirm: true,
			subagentDepth: 0,
			async runSubagent() {
				return 'should-not-run';
			},
		};
		const result = await tool!.execute(
			{
				subagent_type: 'general',
				prompts: ['fix A', 'fix B'],
			},
			ctx,
		);
		assert.strictEqual(result.ok, false);
		assert.ok(
			/allow_mutating_parallel/i.test(result.content),
			result.content,
		);
	});

	test('prompts[] readonly explore - parallel aggregate', async () => {
		const tool = getToolByName('task');
		assert.ok(tool);
		const jobs: Array<{ id: string; status: string }> = [];
		const ctx: SkipConfirmCtx = {
			skipConfirm: true,
			subagentDepth: 0,
			async runSubagent() {
				return 'report-ok';
			},
			onSubagentJob(job) {
				jobs.push({
					id: job.id,
					status: job.status
				});
			},
		};
		const result = await tool!.execute(
			{
				subagent_type: 'explore',
				prompts: ['auth flow', 'routing'],
				synthesize: false,
				max_parallel: 2,
			},
			ctx,
		);
		assert.strictEqual(result.ok, true, result.content);
		assert.ok(result.content.includes('"parallel": true'), result.content);
		assert.ok(result.content.includes('"okCount": 2'), result.content);
		assert.ok(jobs.some((j) => j.status === 'queued' || j.status === 'running' || j.status === 'done'));
	});
});
