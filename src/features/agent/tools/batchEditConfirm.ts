import type { ApprovalActionType } from '../permissionPolicy';
import { isMutatingTool } from '../auth';

/**
 * Сколько mutating edit-tools осталось после текущего индекса в одном assistant turn.
 * Нужно для кнопки «Allow remaining edits» на ConfirmCard.
 */
export function countRemainingMutatingEdits(
	toolNames: readonly string[],
	fromIndexExclusive: number,
): number {
	let n = 0;
	for (let i = fromIndexExclusive + 1; i < toolNames.length; i += 1) {
		const name = toolNames[i];
		if (name && isMutatingTool(name)) {
			n += 1;
		}
	}

	return n;
}

// Показывать «Allow remaining edits», если после текущей правки есть ещё mutating edits
export function shouldOfferAllowRemainingEdits(remainingAfterCurrent: number): boolean {
	return remainingAfterCurrent > 0;
}

/**
 * Пропуск confirm для последующих edits/delete в этом turn после «Allow remaining».
 * Sensitive (.env*) и не-edit actions (shell/web/...) не покрываются.
 */
export function shouldSkipConfirmForBatchEdits(opts: {
	allowRemainingEditsThisTurn?: boolean;
	action?: ApprovalActionType;
	sensitiveWrite?: boolean;
}): boolean {
	if (!opts.allowRemainingEditsThisTurn || opts.sensitiveWrite) {
		return false;
	}

	return opts.action === 'edits' || opts.action === 'delete';
}
