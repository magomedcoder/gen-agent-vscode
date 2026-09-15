import * as path from 'node:path';

export type RelatedTestHit = {
	path: string;
	reason: 'self' | 'sidecar' | '__tests__' | 'mirror' | 'name';
	score: number;
};

const WEAK_STEMS = new Set([
	'index',
	'main',
	'app',
	'util',
	'utils',
	'helper',
	'helpers',
	'types',
	'common',
	'config',
	'constants',
	'mod',
	'lib',
]);

// Эвристика: связанные тестовые файлы по имени/папке (меньше false positives)
export function suggestRelatedTests(changedPaths: string[], allFiles: string[]): string[] {
	return rankRelatedTests(changedPaths, allFiles).map((h) => h.path);
}

export function rankRelatedTests(changedPaths: string[], allFiles: string[]): RelatedTestHit[] {
	const changed = changedPaths.map((p) => p.replace(/\\/g, '/').replace(/^\.\//, '')).filter(Boolean);
	const files = allFiles.map((p) => p.replace(/\\/g, '/'));
	const best = new Map<string, RelatedTestHit>();

	const consider = (hit: RelatedTestHit) => {
		const prev = best.get(hit.path);
		if (!prev || hit.score > prev.score) {
			best.set(hit.path, hit);
		}
	};

	for (const src of changed) {
		if (isTestPath(src)) {
			consider({ path: src, reason: 'self', score: 100 });
			continue;
		}

		const base = path.posix.basename(src).replace(/\.[^.]+$/, '');
		const dir = path.posix.dirname(src);
		const stem = base.replace(/\.module$/, '');
		const weakStem = WEAK_STEMS.has(stem.toLowerCase()) || stem.length < 3;

		for (const f of files) {
			if (!isTestPath(f)) {
				continue;
			}

			const fBase = path.posix.basename(f);
			const fDir = path.posix.dirname(f);

			// рядом: foo.ts -> foo.test.ts / foo.spec.ts
			if (
				fDir === dir
				&& (fBase === `${stem}.test.ts`
					|| fBase === `${stem}.test.tsx`
					|| fBase === `${stem}.spec.ts`
					|| fBase === `${stem}.spec.tsx`
					|| fBase === `${base}.test.ts`
					|| fBase === `${base}.spec.ts`
					|| fBase.startsWith(`${stem}.test.`)
					|| fBase.startsWith(`${stem}.spec.`))
			) {
				consider({ path: f, reason: 'sidecar', score: 90 });
				continue;
			}

			// __tests__/foo.test.ts рядом с модулем
			if (
				(fDir === `${dir}/__tests__` || fDir.endsWith('/__tests__'))
				&& (fBase === `${stem}.ts`
					|| fBase === `${stem}.tsx`
					|| fBase.startsWith(`${stem}.`)
					|| fBase === `${stem}.test.ts`
					|| fBase === `${stem}.spec.ts`)
			) {
				consider({ path: f, reason: '__tests__', score: 80 });
				continue;
			}

			// зеркало src/ -> src/test/
			const mirrored = mirrorToTestDir(src);
			if (mirrored) {
				const mirroredStem = mirrored.replace(/\.[^.]+$/, '');
				if (f === mirrored || f.startsWith(`${mirroredStem}.`)) {
					consider({ path: f, reason: 'mirror', score: 70 });
					continue;
				}
			}

			// слабый name-match только для длинных/уникальных stem
			if (!weakStem) {
				const nameRe = new RegExp(`(?:^|[._-])${escapeRegExp(stem)}(?:[._-]|\\.|$)`, 'i');
				if (nameRe.test(fBase) && (f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__'))) {
					consider({ path: f, reason: 'name', score: 40 });
				}
			}
		}
	}

	return [...best.values()]
		.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
		.slice(0, 40);
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isTestPath(rel: string): boolean {
	const p = rel.replace(/\\/g, '/');
	return (
		/(?:^|\/)__tests__\//.test(p)
		|| /\.(?:test|spec)\.[^.]+$/.test(p)
		|| /(?:^|\/)tests?\//.test(p)
	);
}

function mirrorToTestDir(src: string): string | undefined {
	const p = src.replace(/\\/g, '/');
	if (p.startsWith('src/')) {
		const rest = p.slice(4);
		const noExt = rest.replace(/\.[^.]+$/, '');
		return `src/test/${noExt}.test.ts`;
	}

	return undefined;
}

// Игнор путей для test_impact / repo_health (gitignore-подобные паттерны)
export function filterIgnoredPaths(
	paths: readonly string[],
	ignorePatterns: readonly string[],
): string[] {
	const active = ignorePatterns.map((p) => p.trim()).filter((p) => p && !p.startsWith('#'));
	if (active.length === 0) {
		return [...paths];
	}

	return paths.filter((rel) => !matchesSimpleIgnore(rel.replace(/\\/g, '/'), active));
}

export function matchesSimpleIgnore(rel: string, patterns: readonly string[]): boolean {
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
			const ext = pat.slice(1);
			if (p.endsWith(ext)) {
				return true;
			}
			continue;
		}

		if (pat.includes('*')) {
			const re = new RegExp(`^${escapeRegExp(pat).replace(/\\\*/g, '.*')}$`);
			if (re.test(p) || re.test(path.posix.basename(p))) {
				return true;
			}
			continue;
		}

		if (p === pat || p.startsWith(`${pat}/`) || path.posix.basename(p) === pat) {
			return true;
		}
	}

	return false;
}

// Разобрать пути из git status --porcelain
export function pathsFromGitPorcelain(porcelain: string): string[] {
	const out: string[] = [];
	for (const line of porcelain.split(/\r?\n/)) {
		if (line.length < 4) {
			continue;
		}

		// XY PATH или XY ORIG -> PATH
		const rest = line.slice(3).trim();
		const arrow = rest.includes(' -> ') ? rest.split(' -> ').pop()! : rest;
		const cleaned = arrow.replace(/^"+|"+$/g, '').trim();
		if (cleaned) {
			out.push(cleaned.replace(/\\/g, '/'));
		}
	}

	return [...new Set(out)];
}
