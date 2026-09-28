import * as assert from 'assert';
import { stripAnsi } from '../features/agent/ansi.js';

suite('terminalBuffer / ansi', () => {
	test('stripAnsi removes CSI and OSC', () => {
		assert.strictEqual(stripAnsi('\u001b[31merror\u001b[0m'), 'error');
		assert.strictEqual(stripAnsi('\u001b]0;title\u0007ok'), 'ok');
		assert.strictEqual(stripAnsi('plain\r\nline'), 'plain\nline');
	});

	test('stripAnsi leaves plain text', () => {
		assert.strictEqual(stripAnsi('npm test failed'), 'npm test failed');
		assert.strictEqual(stripAnsi(''), '');
	});
});
