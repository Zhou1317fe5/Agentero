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

## Paper reading order

For a paper folder, use the richest available source in this order:

1. `source/**/*.{tex,ltx}` — prefer for structure, equations, citations, experiments
2. `{paper}/PAPER.md` — LiteParse body when no TeX
3. If neither: `agentero paper parse {paper}`, then read the generated `PAPER.md`
4. Local PDF under the paper folder — last resort

`NOTES.md` is the user's working note, not the paper body. Read it for context;
preserve user-written content; never treat it as a substitute for the source.

## Rules

- Prefer using CLI to manage vault, including moving, downloading, analyzing layout papers. refer skill **`agentero-cli`** (`$agentero-cli` / `/agentero-cli`) with `--json`. 
- Do not invent facts, numbers, citations, or experimental conclusions. Mark uncertainty.
- Keep `[[wikilinks]]` and `![[embeds]]` as written; preserve ` ```mermaid ` fences.
- Math (KaTeX): inline `$…$`, display `$$…$$` on their own lines; prefer `$`/`$$`
  over `\(...\)` / bare TeX in prose; escape a literal dollar as `\$`.
- Cite sources inline with Markdown links, e.g.
  `([Section 2.3](papers/<id>/PAPER.md#section=2.3))` or
  `([Figure 1](papers/<id>/<id>.pdf#figure=1))`. Prefer vault-relative paths.
  For web pages use `([domain](https://...))`.
- Never overwrite user notes without an explicit draft + confirmation path.
