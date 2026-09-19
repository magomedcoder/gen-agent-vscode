import * as assert from 'assert';
import { countRemainingMutatingEdits, shouldOfferAllowRemainingEdits, shouldSkipConfirmForBatchEdits } from '../features/agent/tools/batchEditConfirm.js';
import { isAllowRemainingConfirmChoice, resolveConfirmChoiceOutcome, resolveToolConfirmGating } from '../features/agent/tools/confirmDecision.js';

suite('batchEditConfirm', () => {
	test('countRemainingMutatingEdits: считает edits после текущего индекса', () => {
		const names = ['read_file', 'write_file', 'edit_file', 'run_command', 'delete_file'];
		assert.strictEqual(countRemainingMutatingEdits(names, 0), 3);
		assert.strictEqual(countRemainingMutatingEdits(names, 1), 2);
		assert.strictEqual(countRemainingMutatingEdits(names, 2), 1);
		assert.strictEqual(countRemainingMutatingEdits(names, 4), 0);
	});

	test('shouldOfferAllowRemainingEdits только при remaining > 0', () => {
		assert.strictEqual(shouldOfferAllowRemainingEdits(0), false);
		assert.strictEqual(shouldOfferAllowRemainingEdits(1), true);
		assert.strictEqual(shouldOfferAllowRemainingEdits(3), true);
	});

	test('shouldSkipConfirmForBatchEdits: edits/delete, не sensitive, не shell', () => {
		assert.strictEqual(
			shouldSkipConfirmForBatchEdits({
				allowRemainingEditsThisTurn: true,
				action: 'edits',
			}),
			true,
		);
		assert.strictEqual(
			shouldSkipConfirmForBatchEdits({
				allowRemainingEditsThisTurn: true,
				action: 'delete',
			}),
			true,
		);
		assert.strictEqual(
			shouldSkipConfirmForBatchEdits({
				allowRemainingEditsThisTurn: true,
				action: 'shell',
			}),
			false,
		);
		assert.strictEqual(
			shouldSkipConfirmForBatchEdits({
				allowRemainingEditsThisTurn: true,
				action: 'edits',
				sensitiveWrite: true,
			}),
			false,
		);
		assert.strictEqual(
			shouldSkipConfirmForBatchEdits({
				allowRemainingEditsThisTurn: false,
				action: 'edits',
			}),
			false,
		);
	});

	test('allow_remaining -> proceed; isAllowRemainingConfirmChoice', () => {
		assert.strictEqual(resolveConfirmChoiceOutcome('allow_remaining'), 'proceed');
		assert.strictEqual(isAllowRemainingConfirmChoice('allow_remaining'), true);
		assert.strictEqual(isAllowRemainingConfirmChoice('always'), false);
		assert.strictEqual(isAllowRemainingConfirmChoice('apply'), false);
	});

	test('gating: allowRemainingEditsThisTurn пропускает review edits, не shell / .env*', () => {
		const review = resolveToolConfirmGating({
			decision: 'review',
			action: 'edits',
			autoApprove: false,
			sensitiveWrite: false,
			planShellForceAsk: false,
			nestedStrictMutating: false,
			allowRemainingEditsThisTurn: true,
		});
		assert.strictEqual(review.skipConfirm, true);
		assert.strictEqual(review.forceConfirm, false);

		const shell = resolveToolConfirmGating({
			decision: 'ask',
			action: 'shell',
			autoApprove: false,
			sensitiveWrite: false,
			planShellForceAsk: false,
			nestedStrictMutating: false,
			allowRemainingEditsThisTurn: true,
		});
		assert.strictEqual(shell.skipConfirm, false);

		const sensitive = resolveToolConfirmGating({
			decision: 'ask',
			action: 'edits',
			autoApprove: false,
			sensitiveWrite: true,
			planShellForceAsk: false,
			nestedStrictMutating: false,
			allowRemainingEditsThisTurn: true,
		});
		assert.strictEqual(sensitive.skipConfirm, false);
		assert.strictEqual(sensitive.forceConfirm, false);
	});
});
