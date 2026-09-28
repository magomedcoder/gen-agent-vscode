import * as assert from 'node:assert/strict';
import { stripAnsi } from '../features/agent/ansi.js';
import { compileNotifyPattern, matchNotifyOnOutput } from '../features/agent/notifyOnOutput.js';
import { resolveHostShellInvoker, resolveScriptRunner, supportedScratchExtensions } from '../features/agent/scriptRunner.js';

suite('ansi', () => {
	test('stripAnsi removes CSI and OSC', () => {
		assert.strictEqual(stripAnsi('\u001b[31merror\u001b[0m'), 'error');
		assert.strictEqual(stripAnsi('\u001b]0;title\u0007ok'), 'ok');
		assert.strictEqual(stripAnsi('plain\r\nline'), 'plain\nline');
	});
});

suite('notifyOnOutput', () => {
	test('не матчит старый буфер до fromOffset', () => {
		const pattern = /READY/;
		const output = 'READY\nmore';
		assert.equal(matchNotifyOnOutput({ output, fromOffset: output.length, pattern }).matched, false);
		assert.equal(matchNotifyOnOutput({ output: `${output}\nREADY ok`, fromOffset: output.length, pattern }).matched, true);
	});

	test('срезает ANSI перед regex', () => {
		const pattern = /error/;
		const out = '\u001b[31merror\u001b[0m happened';
		assert.equal(matchNotifyOnOutput({ output: out, fromOffset: 0, pattern }).matched, true);
	});

	test('compileNotifyPattern', () => {
		assert.equal(compileNotifyPattern('').ok, false);
		assert.equal(compileNotifyPattern('(unclosed').ok, false);
		const ok = compileNotifyPattern('foo');
		assert.equal(ok.ok, true);
		if (ok.ok) {
			assert.ok(ok.pattern.test('foo'));
		}
	});
});

suite('scriptRunner', () => {
	test('resolveScriptRunner .ps1 -> pwsh -File', () => {
		const r = resolveScriptRunner('tools/run.ps1');
		assert.ok(r);
		assert.strictEqual(r!.command, 'pwsh');
		assert.deepStrictEqual(r!.argsPrefix, ['-NoProfile', '-File']);
		assert.ok(supportedScratchExtensions().includes('.ps1'));
	});

	test('resolveHostShellInvoker windows prefers pwsh', () => {
		const inv = resolveHostShellInvoker();
		if (process.platform === 'win32') {
			assert.strictEqual(inv.command, 'pwsh');
			assert.deepStrictEqual(inv.argsFor('echo hi'), ['-NoProfile', '-NonInteractive', '-Command', 'echo hi']);
			assert.ok(inv.fallback);
		} else {
			assert.strictEqual(inv.command, '/bin/sh');
			assert.deepStrictEqual(inv.argsFor('echo hi'), ['-c', 'echo hi']);
		}
	});
});
