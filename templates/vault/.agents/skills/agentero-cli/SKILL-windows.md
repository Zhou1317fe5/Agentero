---
name: agentero-cli
version: 15
description: >-
  Use the Agentero CLI (bin `agentero-cli` on Windows) to create, discover, and
  inspect a local research vault and catalog—list/get papers, import by id/URL,
  layout regions, reading marks, download assets, parse PAPER.md, export bib—
  without BYOA. Prefer --json. Discover exact flags via `agentero-cli describe`.
  Use when managing a vault headless, scripting Motif/Agentero, or exploring
  papers via machine APIs ($agentero-cli / /agentero-cli).
---

# Agentero CLI (Windows)

## Role

You use the **`agentero-cli` CLI** as a stable machine interface to an Agentero
vault. The CLI is **not** a chat runtime: no BYOA, no ACP, no paper-reader.
Reading and writing lecture-style `NOTES.md` is **your** job (or use the separate
`paper-reader` skill / desktop Zap workflow).

## Prerequisites

- Binary name: **`agentero-cli`** (Windows). Desktop: 设置 → 关于 → 安装 CLI
  writes the `agentero-cli.cmd` shim and adds its install dir to the **user
  PATH**; already-running terminals must be restarted to see it. If missing from
  PATH, say so and fall back to reading Vault files directly; do not invent
  catalog rows.
- Shells: examples use **PowerShell**. Quote args containing spaces or cmd
  metacharacters: cmd `"..."`, PowerShell `'...'`.
- Prefer always passing **`--json`** (disables interactive prompts). JSON is a
  compact single line; `--pretty` pretty-prints for humans.
- Destructive deletes: pass **`-y` / `--yes`** under `--json` / non-TTY.
- Vault resolution (first wins): `--vault <path>` → env `AGENTERO_VAULT` → cwd
  walk-up (`.agentero/catalog.sqlite`).

## Command discovery (source of truth)

```powershell
agentero-cli describe --json
agentero-cli describe paper.list --json
agentero-cli <group> --help
```

Do **not** invent subcommands. There is no `agentero-cli graph`.

## Hard boundaries

| Do | Do not |
|---|---|
| Call CLI for vault/catalog/import/layout/marks | Spawn coding agents via CLI |
| Read files at returned paths | Assume CLI wrote full lecture NOTES |
| Progressive disclosure L0→L4 | Dump entire PDF/TeX into the prompt by default |
| Skip overwrite of user NOTES on re-import | Force-overwrite without explicit user ask |
| Use `describe` for exact flags | Hand-edit `marks/annotations.json` or `layout-index.json` |

## Progressive disclosure

1. **L0** — `AGENTS.md` (if present)
2. **L1** — `agentero-cli paper list --json` — default rows are only `id/path/title`;
   add `--fields year,tags,…` or `--full` only when needed
3. **L2** — `{paper}/NOTES.md`
4. **L2.5** — `agentero-cli layout list` / `agentero-cli mark *`
5. **L3** — `{paper}/PAPER.md` (if no TeX)
6. **L4** — `{paper}/source/**` (TeX preferred when present)

## Default agent protocol

```powershell
agentero-cli vault list --json
agentero-cli paper list --json
agentero-cli paper get <path|id> --json
# then read NOTES → layout/marks → PAPER.md / TeX yourself
agentero-cli import id <arxiv|doi|url> --json
# after finishing NOTES:
agentero-cli paper set-read <path> --json
```

Exact flags for mark/layout/doctor/export: `agentero-cli describe <op> --json`.

## JSON contract

- Success: `{ "ok": true, "data": … }` on stdout (compact; `--pretty` indents).
- Failure: non-zero exit + `{ "ok": false, "error": { "code", "message", "details" } }`.
- Stdout = result; stderr = progress/diagnostics. Parse `error.code` when retrying.

## Path / id resolution

- Prefer **Vault-relative `path`** (e.g. `papers/1706.03762`).
- Bare **id**: if multiple rows match, CLI errors with candidates — retry with full `path`.

## Invariants

- On `mark_locate_failed`, retry with a longer verbatim quote — **never** guess coordinates.
- On `layout_index_missing`, ask the user to open the paper in Agentero and run Figures analysis — do not invent bboxes.
- Keep Obsidian wikilinks `[[...]]` when you edit Markdown.
- Never invent catalog metadata; trust CLI / files.
- Always run `agentero-cli paper set-read <path>` after finishing NOTES.md.
- Prefer short tool loops: list → get → read files → answer.

## Activation notes

Depending on the agent: **Codex** `$agentero-cli`, **Claude** `/agentero-cli`,
others follow this body directly.
