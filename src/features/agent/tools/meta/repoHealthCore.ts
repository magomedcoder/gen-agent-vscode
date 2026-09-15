import * as path from 'node:path';

const JS_EXT = /\.(?:[cm]?[jt]s|tsx|jsx)$/i;

// Импорты ES/CJS из текста файла (эвристика, без AST)
export function extractJsImports(source: string): string[] {
	const out: string[] = [];
	const patterns = [
		/\bfrom\s+['"]([^'"]+)['"]/g,
		/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\bimport\s+['"]([^'"]+)['"]/g,
		/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
		/\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g,
	];

	for (const re of patterns) {
		re.lastIndex = 0;
		let m: RegExpExecArray | null;
		while ((m = re.exec(source)) !== null) {
			const spec = m[1]?.trim();
			if (spec) {
				out.push(spec);
			}
		}
	}

	return [...new Set(out)];
}

function stripExt(rel: string): string {
	return rel.replace(/\.(?:[cm]?[jt]s|tsx|jsx)$/i, '');
}

// Резолв относительного спецификатора к posix-пути из набора файлов
export function resolveImportSpec(
	fromFile: string,
	spec: string,
	fileSet: Set<string>,
): string | undefined {
	if (!spec.startsWith('.')) {
		return undefined;
	}

	const fromDir = path.posix.dirname(fromFile);
	const joined = path.posix.normalize(path.posix.join(fromDir, spec));
	const candidates = [
		joined,
		`${joined}.ts`,
		`${joined}.tsx`,
		`${joined}.js`,
		`${joined}.jsx`,
		`${joined}.mjs`,
		`${joined}.cjs`,
		`${joined}/index.ts`,
		`${joined}/index.tsx`,
		`${joined}/index.js`,
		`${joined}/index.jsx`,
	];

	for (const c of candidates) {
		if (fileSet.has(c)) {
			return c;
		}
	}

	const noExt = stripExt(joined);
	for (const f of fileSet) {
		if (stripExt(f) === noExt || stripExt(f) === `${noExt}/index`) {
			return f;
		}
	}

	return undefined;
}

export function buildImportGraph(files: Array<{ path: string; source: string }>): Map<string, string[]> {
	const fileSet = new Set(files.map((f) => f.path));
	const graph = new Map<string, string[]>();

	for (const file of files) {
		if (!JS_EXT.test(file.path)) {
			continue;
		}

		const deps: string[] = [];
		for (const spec of extractJsImports(file.source)) {
			const resolved = resolveImportSpec(file.path, spec, fileSet);
			if (resolved && resolved !== file.path) {
				deps.push(resolved);
			}
		}
		graph.set(file.path, [...new Set(deps)]);
	}

	return graph;
}

// Простые циклы через DFS (уникальные циклы по нормализованному ключу)
export function findImportCycles(graph: Map<string, string[]>): string[][] {
	const cycles: string[][] = [];
	const seenCycle = new Set<string>();
	const visiting = new Set<string>();
	const stack: string[] = [];

	const visit = (node: string) => {
		if (visiting.has(node)) {
			const idx = stack.indexOf(node);
			if (idx >= 0) {
				const cycle = [...stack.slice(idx), node];
				const key = [...cycle].sort().join('>');
				if (!seenCycle.has(key)) {
					seenCycle.add(key);
					cycles.push(cycle);
				}
			}
			return;
		}

		if (!graph.has(node)) {
			return;
		}

		visiting.add(node);
		stack.push(node);
		for (const next of graph.get(node) ?? []) {
			visit(next);
		}
		stack.pop();
		visiting.delete(node);
	};

	for (const node of graph.keys()) {
		visit(node);
	}

	return cycles.slice(0, 50);
}

const ENTRY_HINT = /(?:^|\/)(?:index|main|app|extension|activate)(?:\.[^/]+)?$/i;
const ORPHAN_SKIP = /(?:\.d\.ts$|\/(?:dist|build|out|coverage|storybook|__mocks__|fixtures|generated|vendor)\b|\.stories\.|\.story\.|\.mock\.|\.config\.|\.min\.)/i;

export type OrphanOptions = {
	// Доп. gitignore-подобные паттерны (не считать orphans / не сканировать)
	ignorePatterns?: readonly string[];
};

// Файлы, на которые никто не ссылается (кроме вероятных entrypoints / тестов / generated)
export function findOrphanFiles(graph: Map<string, string[]>, opts?: OrphanOptions): string[] {
	const imported = new Set<string>();
	for (const deps of graph.values()) {
		for (const d of deps) {
			imported.add(d);
		}
	}

	const ignore = opts?.ignorePatterns ?? [];
	const orphans: string[] = [];
	for (const file of graph.keys()) {
		if (imported.has(file)) {
			continue;
		}

		if (
			ENTRY_HINT.test(file)
			|| file.includes('/test/')
			|| file.includes('.test.')
			|| file.includes('.spec.')
			|| ORPHAN_SKIP.test(file)
		) {
			continue;
		}

		if (ignore.length > 0 && matchesIgnorePatterns(file, ignore)) {
			continue;
		}

		orphans.push(file);
	}

	return orphans.sort().slice(0, 200);
}

export function matchesIgnorePatterns(rel: string, patterns: readonly string[]): boolean {
	const p = rel.replace(/\\/g, '/').replace(/^\.\//, '');
	for (const raw of patterns) {
		const pat = raw.trim().replace(/\\/g, '/');
		if (!pat || pat.startsWith('#')) {
			continue;
		}

		if (pat.endsWith('/')) {
			const dir = pat.slice(0, -1);
			if (p === dir || p.startsWith(`${dir}/`)) {
				return true;
			}
			continue;
		}

		if (pat.startsWith('*.')) {
			if (p.endsWith(pat.slice(1))) {
				return true;
			}
			continue;
		}

		if (pat.includes('*')) {
			const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
			if (new RegExp(`^${escaped}$`).test(p)) {
				return true;
			}
			continue;
		}

		if (p === pat || p.startsWith(`${pat}/`) || p.endsWith(`/${pat}`)) {
			return true;
		}
	}

	return false;
}

export function isJsLikePath(rel: string): boolean {
	return JS_EXT.test(rel);
}

// Ключ кэша отчёта: число файлов + простой digest путей
export function repoHealthCacheKey(
	paths: readonly string[],
	ignorePatterns: readonly string[],
): string {
	const joined = [...paths].sort().join('\n');
	const ign = [...ignorePatterns].map((s) => s.trim()).filter(Boolean).sort().join('\n');
	let h = 2166136261;
	const s = `${joined}\n#\n${ign}`;
	for (let i = 0; i < s.length; i += 1) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	
	return `${paths.length}:${(h >>> 0).toString(16)}`;
}
