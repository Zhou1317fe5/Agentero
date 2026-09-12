# AGENTS.md

This file is the L0 map for agents working in this Agentero research vault.

## Layout

- `papers/` — paper folders (any depth). A **paper folder** is the minimal unit:

```text
papers/<id>/
├── NOTES.md          # human / agent working notes
├── metadata.json     # catalog row projection (do not invent by hand)
├── <id>.pdf          # optional main PDF
├── PAPER.md          # derived body when no TeX (regenerable)
├── source/           # TeX / e-print (do not dump extras here)
├── marks/            # reading annotations (prefer CLI `mark`, not hand-edits)
├── assets/           # images embedded from NOTES.md
└── attachments/      # supporting materials only (supplements, slides, code)
```

  Create `attachments/` only when adding files. Do not put extras at the paper
  root or into `source/`. Do not invent empty `attachments/` folders.

- `notes/` — free-form concept notes (`[[wikilinks]]`, embeds, Mermaid, callouts).
- `.agents/` — vault-local skills (`skills/<id>/SKILL.md`).
- Tooling: prefer skill **`agentero-cli`** (`$agentero-cli` / `/agentero-cli`)
  with `--json`. Exact flags: `agentero describe --json`. The CLI does not run
  agents or paper-reader.

## Paper reading order

For a paper folder, use the richest available source in this order:

1. `source/**/*.{tex,ltx}` — prefer for structure, equations, citations, experiments
2. `{paper}/PAPER.md` — LiteParse body when no TeX
3. If neither: `agentero paper parse {paper}`, then read the generated `PAPER.md`
4. Local PDF under the paper folder — last resort

`NOTES.md` is the user's working note, not the paper body. Read it for context;
preserve user-written content; never treat it as a substitute for the source.

## Rules

- Keep `source/` unchanged; treat `PAPER.md` as derived and regenerable.
- Do not invent facts, numbers, citations, or experimental conclusions. Mark uncertainty.
- Keep `[[wikilinks]]` and `![[embeds]]` as written; preserve ` ```mermaid ` fences.
- Math (KaTeX): inline `$…$`, display `$$…$$` on their own lines; prefer `$`/`$$`
  over `\(...\)` / bare TeX in prose; escape a literal dollar as `\$`.
- Cite vault-relative paths actually read; end substantial answers with `## Sources`.
- Never overwrite user notes without an explicit draft + confirmation path.
- Do not store API keys or other secrets in the Vault.
