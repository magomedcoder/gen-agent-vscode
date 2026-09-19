import * as assert from 'assert';
import { formatExecOutput, formatPartialShellPreview } from '../features/agent/shellExec.js';

suite('shellExec streaming format', () => {
	test('formatPartialShellPreview помечает running', () => {
		const text = formatPartialShellPreview({
			commandLine: 'npm test',
			cwd: '/tmp/proj',
			raw: 'PASS a.test.js\n',
		});
		assert.ok(text.includes('exit: running'));
		assert.ok(text.includes('PASS a.test.js'));
		assert.ok(text.includes('$ npm test'));
	});

	test('formatExecOutput финальный exit code', () => {
		const text = formatExecOutput({
			commandLine: 'echo hi',
			cwd: '.',
			exitCode: 0,
			stdout: 'hi\n',
			stderr: '',
		});
		assert.ok(text.includes('exit: 0'));
		assert.ok(!text.includes('running'));
	});
});
