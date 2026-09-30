import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ExtensionContext } from 'vscode';
import type { ChatUiMessage } from './protocol';

const DIR_NAME = 'export-archives';

function archivesRoot(context: ExtensionContext): string | undefined {
	const base = context.storageUri?.fsPath;
	if (!base) {
		return undefined;
	}

	return path.join(base, DIR_NAME);
}

function archivePath(context: ExtensionContext, sessionId: string): string | undefined {
	const root = archivesRoot(context);
	if (!root) {
		return undefined;
	}

	const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
	return path.join(root, `${safe}.json`);
}

// Сохранить lossless-архив сессии (до compact) на диск workspace storage
export async function saveExportArchive(
	context: ExtensionContext,
	sessionId: string,
	messages: ChatUiMessage[],
): Promise<void> {
	const file = archivePath(context, sessionId);
	if (!file) {
		return;
	}

	await fs.mkdir(path.dirname(file), { recursive: true });
	const payload = {
		version: 1,
		sessionId,
		savedAt: Date.now(),
		messages,
	};
	await fs.writeFile(file, JSON.stringify(payload), 'utf8');
}

// Загрузить архив; нет файла / битый JSON -> undefined
export async function loadExportArchive(
	context: ExtensionContext,
	sessionId: string,
): Promise<ChatUiMessage[] | undefined> {
	const file = archivePath(context, sessionId);
	if (!file) {
		return undefined;
	}

	try {
		const raw = await fs.readFile(file, 'utf8');
		const parsed = JSON.parse(raw) as { messages?: unknown };
		if (!Array.isArray(parsed.messages)) {
			return undefined;
		}

		return parsed.messages.filter((m): m is ChatUiMessage => Boolean(m && typeof m === 'object' && typeof (m as ChatUiMessage).id === 'string'));
	} catch {
		return undefined;
	}
}

// Удалить файл архива сессии
export async function deleteExportArchive(context: ExtensionContext, sessionId: string): Promise<void> {
	const file = archivePath(context, sessionId);
	if (!file) {
		return;
	}

	try {
		await fs.unlink(file);
	} catch {}
}

// Есть ли файл архива на диске (без чтения содержимого)
export async function exportArchiveExists(context: ExtensionContext, sessionId: string): Promise<boolean> {
	const file = archivePath(context, sessionId);
	if (!file) {
		return false;
	}

	try {
		await fs.access(file);
		return true;
	} catch {
		return false;
	}
}
