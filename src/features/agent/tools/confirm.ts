import * as vscode from 'vscode';
import { getSettings } from '../../../core/config/settings';
import { shouldConfirmDeletes, shouldConfirmWrites } from '../auth';
import { previewText } from '../policy';
import { throwIfAborted } from '../workspacePath';
import type { ConfirmChoice, ToolContext, ToolResult } from '../types';

export function abortTurn(): never {
	const err = new Error(vscode.l10n.t('agent.operationCancelled'));
	err.name = 'AbortError';
	throw err;
}

export type ConfirmOrSkipOpts = {
	suggestion?: string;
	allowAlways?: boolean;
	applyLabel?: string;
	skipLabel?: string;
	rejectLabel?: string;
	hint?: string;
};

export async function confirmOrSkip(
	ctx: ToolContext,
	title: string,
	detail?: string,
	opts?: ConfirmOrSkipOpts,
): Promise<ToolResult | undefined> {
	throwIfAborted(ctx.signal);
	const ext = ctx as ToolContext & {
		skipConfirm?: boolean
		forceConfirm?: boolean
	};
	// forceConfirm (Plan shell ask / review diff) перекрывает autoApprove / skipConfirm
	if (!ext.forceConfirm && (ext.skipConfirm || getSettings().autoApprove)) {
		return undefined;
	}

	if (!ctx.confirm) {
		return {
			ok: false,
			denied: true,
			content: vscode.l10n.t('agent.confirmUiUnavailable'),
		};
	}

	const choice: ConfirmChoice = await new Promise((resolve, reject) => {
		const onAbort = () => {
			const err = new Error(vscode.l10n.t('agent.operationCancelled'));
			err.name = 'AbortError';
			reject(err);
		};
		if (ctx.signal?.aborted) {
			onAbort();
			return;
		}

		ctx.signal?.addEventListener('abort', onAbort, { once: true });
		void Promise.resolve(ctx.confirm!({
			title,
			detail: detail ? previewText(detail) : undefined,
			hint: opts?.hint,
			suggestion: opts?.suggestion,
			allowAlways: opts?.allowAlways,
			applyLabel: opts?.applyLabel,
			skipLabel: opts?.skipLabel,
			rejectLabel: opts?.rejectLabel,
		})).then((value) => {
			ctx.signal?.removeEventListener('abort', onAbort);
			resolve(value);
		}, (err: unknown) => {
			ctx.signal?.removeEventListener('abort', onAbort);
			reject(err);
		});
	});

	if (choice === 'apply' || choice === 'always') {
		const onAlways = (ctx as ToolContext & { onAlwaysAllow?: (pattern: string) => void }).onAlwaysAllow;
		if (choice === 'always' && opts?.suggestion && onAlways) {
			onAlways(opts.suggestion);
		}

		return undefined;
	}

	if (choice === 'skip') {
		return {
			ok: false,
			denied: true,
			content: vscode.l10n.t('agent.userDenied'),
		};
	}

	abortTurn();
}

export async function confirmAlwaysOrSkip(
	ctx: ToolContext,
	title: string,
	detail?: string,
	opts?: Omit<ConfirmOrSkipOpts, 'allowAlways'>,
): Promise<ToolResult | undefined> {
	const forceConfirm = (ctx as ToolContext & { forceConfirm?: boolean }).forceConfirm;
	if (!forceConfirm && getSettings().autoApprove) {
		return undefined;
	}

	const suggestion = opts?.suggestion
		?? (ctx as ToolContext & { suggestAlwaysPattern?: string }).suggestAlwaysPattern;
	return confirmOrSkip(ctx, title, detail, {
		...opts,
		allowAlways: true,
		suggestion,
	});
}

export { shouldConfirmDeletes, shouldConfirmWrites };
