import * as assert from 'assert';
import { activityKindFromTool, summarizeToolActivity } from '../core/stores/activityStore.js';

suite('activity ledger', () => {
	test('классифицирует kind по имени tool', () => {
		assert.strictEqual(activityKindFromTool('run_command'), 'shell');
		assert.strictEqual(activityKindFromTool('await_shell'), 'shell');
		assert.strictEqual(activityKindFromTool('write_file'), 'edit');
		assert.strictEqual(activityKindFromTool('read_file'), 'tool');
		assert.strictEqual(activityKindFromTool('web_search'), 'tool');
	});

	test('summarize берёт path / command / query', () => {
		assert.strictEqual(
			summarizeToolActivity('write_file', '{}', 'src/a.ts'),
			'write_file: src/a.ts',
		);
		assert.strictEqual(
			summarizeToolActivity('run_command', JSON.stringify({ command: 'ls -la' })),
			'run_command: ls -la',
		);
		assert.strictEqual(
			summarizeToolActivity(
				'web_search',
				JSON.stringify({ query: 'typescript vscode extension' }),
			),
			'web_search: typescript vscode extension',
		);
	});
});
