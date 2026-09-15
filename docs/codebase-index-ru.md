# Индекс кодовой базы

[English version](codebase-index.md)

Локальный индекс workspace в `.gen/index/`. 

Агент ищет по нему через tool `codebase_search` (триграммы), без отправки всего индекса в LLM.

## Зачем

- Быстрый обзор проекта без полного `grep` / `glob`
- Ранжирование фрагментов кода для контекста агента

## Как устроено

- Индекс пишется в `.gen/index/manifest.json` (files, chunks, trigrams, **dirDigests** Merkle-карта).
- При обновлении пересчитываются digests предков; неизменённые каталоги пропускаются при совпадении путей + **content-hash** (size+mtime gate доверяет stored hash; одного size недостаточно).
- LSP **symbol index** (кэш): `.gen/index/symbols.json` через `vscode.executeDocumentSymbolProvider`. Tools: `find_symbol` / `find_code` intent `symbol`, mention `@symbols`.
- **Outline** (без Tree-sitter / native deps - для non-JS **только LSP**): `.gen/index/outline.json`. TS/JS через TypeScript `createSourceFile`; остальные языки через `vscode.executeDocumentSymbolProvider`, если провайдер есть; дешёвый regex fallback только если LSP пуст (`py`/`go`/`rs`/`java`/`kt`/`rb`). Также в `find_symbol` (`source: outline|all`).
- `.gen/` не индексируется (как и `.git`, `node_modules` через ignore).
- При изменении файла переиндексируется только он (сравнение content-hash); outline/symbols обновляются **per-file** (debounce), полный rebuild - только после full index.
- Результаты `codebase_search` - фрагменты (path, строки, snippet, score).
- В чате: `@file`, `@folder`, `@codebase`, `@map`, `@symbols` (см. [chat-ru.md](chat-ru.md)).

### Локальные embeddings (`localEmbeddingsMode`)

| Режим               | Поведение                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `off`               | Только remote `/embeddings`                                                                                                    |
| `trigram` (default) | Remote по возможности; при ошибке / отсутствии remote - fallback на триграммы IndexManager для `semantic_search` / `find_code` |

Call hierarchy / «кто вызывает Y»: tool `find_references` (LSP references + definition; multi-root через `folder`/`root`; paging `limit`/`offset`; cross-lang при наличии language server).

## Использование

1. Открыть workspace и чат Gen.
2. Нажать **Создать конфиг и индекс** (пишет `.gen/config.json`, scaffold-каталоги и строит `.gen/index/`). До этого при открытии папки `.gen/` не создаётся. То же scaffold делает slash `/init`.
3. В режиме Agent вызвать `codebase_search` с `query` (символ, фраза, путь). Предпочтительнее `find_code` / `find_symbol` / `pack_context` / `similar_code`.
4. Для точного grep по строке - `grep` (пути через `glob`).

### Каталоги `.gen/` (scaffold)

При enable проекта или `/init` создаются (если ещё нет): `agents/`, `commands/`, `plugins/`, `skills/`, `tools/`, `references/`, `plans/` - плюс краткий `.gen/README.md` и `.gitkeep` в пустых каталогах. Существующие файлы не перезаписываются. `references.json` появляется по требованию, не при scaffold.

Подробнее про tools: [tools-ru.md](tools-ru.md).
