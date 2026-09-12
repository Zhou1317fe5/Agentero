---
name: agentero-cli
version: 15
description: >-
  Use the Agentero CLI (bin `agentero`) to create, discover, and inspect a local
  research vault and catalog—list/get papers, import by id/URL, layout regions,
  reading marks, download assets, parse PAPER.md, export bib—without BYOA.
  Prefer --json. Discover exact flags via `agentero describe`. Use when managing
  a vault headless, scripting Motif/Agentero, or exploring papers via machine
  APIs ($agentero-cli / /agentero-cli).
---

# Agentero CLI

## Role

You use the **`agentero` CLI** as a stable machine interface to an Agentero vault.
The CLI is **not** a chat runtime: no BYOA, no ACP, no paper-reader. Reading and
writing lecture-style `NOTES.md` is **your** job (or use the separate
`paper-reader` skill / desktop Zap workflow).

## Prerequisites

- Binary name: **`agentero`** (POSIX). Desktop: 设置 → 关于 → 安装 CLI writes the
  `~/.local/bin/agentero` symlink. If missing from PATH, say so and fall back to
  reading Vault files directly; do not invent catalog rows.
- Prefer always passing **`--json`** (disables interactive prompts). JSON is a
  compact single line; `--pretty` pretty-prints for humans.
- Destructive deletes: pass **`-y` / `--yes`** under `--json` / non-TTY.
- Vault resolution (first wins): `--vault <path>` → env `AGENTERO_VAULT` → cwd
  walk-up (`.agentero/catalog.sqlite`).

## Command discovery (source of truth)

```bash
agentero describe --json              # curated op index
agentero describe paper.list --json   # input/output/errors/examples for one op
agentero <group> --help               # human clap help
```

Do **not** invent subcommands. There is no `agentero graph`.

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
2. **L1** — `agentero paper list --json` — default rows are only `id/path/title`;
   add `--fields year,tags,…` or `--full` only when needed
3. **L2** — `{paper}/NOTES.md`
4. **L2.5** — `agentero layout list` / `agentero mark *` (CLI writes mark JSON)
5. **L3** — `{paper}/PAPER.md` (if no TeX)
6. **L4** — `{paper}/source/**` (TeX preferred when present)

## Default agent protocol

```bash
agentero vault list --json
agentero paper list --json
agentero paper get <path|id> --json
# then read NOTES → layout/marks → PAPER.md / TeX yourself
agentero import id <arxiv|doi|url> --json
# after finishing NOTES:
agentero paper set-read <path> --json
```

Exact flags for mark/layout/doctor/export: `agentero describe <op> --json`.

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
- Always run `agentero paper set-read <path>` after finishing NOTES.md.
- Prefer short tool loops: list → get → read files → answer.

## Activation notes

Depending on the agent: **Codex** `$agentero-cli`, **Claude** `/agentero-cli`,
others follow this body directly.
