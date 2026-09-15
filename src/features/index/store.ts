import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { needsManifestRepair, parseManifestJson, repairManifestInMemory } from './manifestParse';
import type { ManifestRepairReason } from './manifestParse';
import { emptyManifest, INDEX_DIR_RELATIVE, INDEX_MANIFEST_RELATIVE } from './types';
import type { IndexManifest } from './types';

export function manifestPathForFolder(folderFsPath: string): string {
	return path.join(folderFsPath, INDEX_MANIFEST_RELATIVE);
}

export async function ensureIndexDir(folderFsPath: string): Promise<void> {
	await fs.mkdir(path.join(folderFsPath, INDEX_DIR_RELATIVE), {
		recursive: true,
	});
}

export async function loadManifest(folderFsPath: string): Promise<IndexManifest> {
	try {
		const raw = await fs.readFile(manifestPathForFolder(folderFsPath), 'utf8');
		const parsed = parseManifestJson(raw);
		if (!parsed.ok) {
			return emptyManifest();
		}

		// Отсутствующие digests не чиним на каждом load - только при явном repair
		return parsed.manifest;
	} catch {
		return emptyManifest();
	}
}

// Проверить манифест на диске: corrupt / missing digests (для UI Repair)
export async function inspectManifest(folderFsPath: string): Promise<{
	exists: boolean;
	corrupt: boolean;
	missingDirDigests: boolean;
	repairReason?: ManifestRepairReason;
	manifest: IndexManifest;
}> {
	try {
		const raw = await fs.readFile(manifestPathForFolder(folderFsPath), 'utf8');
		const parsed = parseManifestJson(raw);
		if (!parsed.ok) {
			return {
				exists: true,
				corrupt: true,
				missingDirDigests: false,
				repairReason: parsed.reason,
				manifest: emptyManifest(),
			};
		}

		return {
			exists: true,
			corrupt: false,
			missingDirDigests: parsed.missingDirDigests,
			repairReason: parsed.missingDirDigests ? 'missing_dir_digests' : undefined,
			manifest: parsed.manifest,
		};
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'ENOENT') {
			return {
				exists: false,
				corrupt: false,
				missingDirDigests: false,
				manifest: emptyManifest(),
			};
		}

		return {
			exists: true,
			corrupt: true,
			missingDirDigests: false,
			repairReason: 'invalid_json',
			manifest: emptyManifest(),
		};
	}
}

/**
 * Починить corrupt / missing-dirDigests манифест на диске.
 * Битый JSON -> emptyManifest; missing digests -> recompute; затем save.
 */
export async function repairManifestFile(folderFsPath: string): Promise<{
	repaired: boolean;
	reason: ManifestRepairReason | 'ok' | 'missing';
	manifest: IndexManifest;
}> {
	try {
		const raw = await fs.readFile(manifestPathForFolder(folderFsPath), 'utf8');
		const parsed = parseManifestJson(raw);
		if (!needsManifestRepair(parsed)) {
			return {
				repaired: false,
				reason: 'ok',
				manifest: parsed.ok ? parsed.manifest : emptyManifest(),
			};
		}

		const { manifest, reason } = repairManifestInMemory(parsed);
		await saveManifest(folderFsPath, manifest);
		return {
			repaired: true,
			reason,
			manifest
		};
	} catch (err) {
		const code = (err as { code?: string }).code;
		if (code === 'ENOENT') {
			const manifest = emptyManifest();
			await saveManifest(folderFsPath, manifest);
			return {
				repaired: true,
				reason: 'missing',
				manifest
			};
		}

		const manifest = emptyManifest();
		await saveManifest(folderFsPath, manifest);
		return {
			repaired: true,
			reason: 'invalid_json',
			manifest
		};
	}
}

export async function saveManifest(folderFsPath: string, manifest: IndexManifest): Promise<void> {
	await ensureIndexDir(folderFsPath);
	manifest.updatedAt = new Date().toISOString();
	await fs.writeFile(manifestPathForFolder(folderFsPath), JSON.stringify(manifest, null, 2), 'utf8');
}
