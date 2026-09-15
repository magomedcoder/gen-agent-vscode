import * as vscode from 'vscode';
import { getSettings } from '../../../../core/config/settings';
import { previewText } from '../../policy';
import { asOptionalInt, type ToolContext, type ToolDefinition, type ToolResult } from '../../types';

import { throwIfAborted } from '../../workspacePath';
import { listIndexableFiles, readIndexableText } from '../../../index/scanner';
import { buildImportGraph, findImportCycles, findOrphanFiles, isJsLikePath, matchesIgnorePatterns, repoHealthCacheKey } from './repoHealthCore';

const DEFAULT_MAX_FILES = 800;

type CachedReport = {
	key: string;
	at: number;
	report: Record<string, unknown>;
};

const reportCache = new Map<string, CachedReport>();
const CACHE_TTL_MS = 60_000;

// MVP: циклы импортов TS/JS (regex) + orphan-файлы -> JSON-отчёт.
export const repoHealthTool: ToolDefinition = {
	name: 'repo_health',
	description: 'Скан TS/JS: эвристические циклы импортов и orphan-файлы (никто не импортирует). JSON-отчёт, без AST. Учитывает watcherIgnore + ignore[].',
	parameters: {
		type: 'object',
		properties: {
			max_files: {
				type: 'integer',
				description: `Макс. файлов для анализа (по умолчанию ${DEFAULT_MAX_FILES})`,
			},
			ignore: {
				type: 'array',
				items: { type: 'string' },
				description: 'Доп. gitignore-подобные паттерны (поверх settings.watcherIgnore)',
			},
			no_cache: {
				type: 'boolean',
				description: 'Пропустить in-memory кэш (TTL 60s)',
			},
		},
		additionalProperties: false,
	},
	async execute(args, ctx: ToolContext): Promise<ToolResult> {
		throwIfAborted(ctx.signal);
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return {
				ok: false,
				content: 'repo_health: нет workspace folder',
			};
		}

		const maxFiles = Math.min(2_000, Math.max(50, asOptionalInt(args, 'max_files') ?? DEFAULT_MAX_FILES));
		const extraIgnore = Array.isArray(args.ignore)
			? args.ignore.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
			: [];
		const ignorePatterns = [...getSettings().watcherIgnore, ...extraIgnore];

		const scanned = await listIndexableFiles(folder);
		const jsAll = scanned
			.map((f) => f.relative)
			.filter((rel) => isJsLikePath(rel))
			.filter((rel) => !matchesIgnorePatterns(rel, ignorePatterns));
		const jsFiles = scanned
			.filter((f) => isJsLikePath(f.relative) && !matchesIgnorePatterns(f.relative, ignorePatterns))
			.slice(0, maxFiles);

		const cacheKey = `${folder.uri.fsPath}:${repoHealthCacheKey(
			jsFiles.map((f) => f.relative),
			ignorePatterns,
		)}:${maxFiles}`;
		const noCache = args.no_cache === true;
		if (!noCache) {
			const hit = reportCache.get(cacheKey);
			if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
				return {
					ok: true,
					content: previewText(
						JSON.stringify({ ...hit.report, cached: true }, null, 2),
						12_000,
					),
				};
			}
		}

		const sources: Array<{ path: string; source: string }> = [];
		for (const file of jsFiles) {
			throwIfAborted(ctx.signal);
			const text = await readIndexableText(file.uri);
			if (text === undefined) {
				continue;
			}

			sources.push({
				path: file.relative,
				source: text,
			});
		}

		const graph = buildImportGraph(sources);
		const cycles = findImportCycles(graph);
		const orphans = findOrphanFiles(graph, { ignorePatterns });

		const report = {
			scannedJs: sources.length,
			capped: jsAll.length > maxFiles,
			ignoredPatterns: ignorePatterns.slice(0, 40),
			cycleCount: cycles.length,
			cycles: cycles.slice(0, 20).map((c) => c.join(' -> ')),
			orphanCount: orphans.length,
			orphans: orphans.slice(0, 80),
			cached: false,
			note: 'Эвристика regex (без AST); relative imports only; entrypoints/tests/stories/generated исключены из orphans',
		};

		reportCache.set(cacheKey, {
			key: cacheKey,
			at: Date.now(),
			report
		});

		return {
			ok: true,
			content: previewText(JSON.stringify(report, null, 2), 12_000),
		};
	},
};
