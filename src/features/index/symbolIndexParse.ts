export interface SymbolIndexEntry {
	name: string;
	kind: string;
	path: string;
	startLine: number;
	endLine: number;
	containerName?: string;
}

export interface SymbolIndexDocument {
	updatedAt: string;
	fileCount: number;
	symbols: SymbolIndexEntry[];
}

// Парсинг кэша (для тестов / загрузки) - без зависимости от vscode
export function parseSymbolIndexJson(raw: string): SymbolIndexDocument | undefined {
	try {
		const parsed = JSON.parse(raw) as SymbolIndexDocument;
		if (!parsed || !Array.isArray(parsed.symbols)) {
			return undefined;
		}

		return {
			updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
			fileCount: typeof parsed.fileCount === 'number' ? parsed.fileCount : 0,
			symbols: parsed.symbols.filter((s) => s && typeof s.name === 'string' && typeof s.path === 'string'),
		};
	} catch {
		return undefined;
	}
}

function recountSymbolFiles(symbols: SymbolIndexEntry[]): number {
	return new Set(symbols.map((s) => s.path)).size;
}

// Инкрементально заменить symbols одного файла (или убрать путь, если next пуст)
export function applySymbolPathUpdate(
	doc: SymbolIndexDocument,
	relative: string,
	nextSymbols: SymbolIndexEntry[],
	maxSymbols: number,
): SymbolIndexDocument {
	const kept = doc.symbols.filter((s) => s.path !== relative);
	const merged = nextSymbols.length > 0 ? [...kept, ...nextSymbols] : kept;
	const symbols = merged.slice(0, Math.max(0, maxSymbols));
	return {
		updatedAt: new Date().toISOString(),
		fileCount: recountSymbolFiles(symbols),
		symbols,
	};
}

export function applySymbolPathRemove(doc: SymbolIndexDocument, relative: string): SymbolIndexDocument {
	const symbols = doc.symbols.filter((s) => s.path !== relative);
	return {
		updatedAt: new Date().toISOString(),
		fileCount: recountSymbolFiles(symbols),
		symbols,
	};
}
