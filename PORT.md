# The port contract

What this port changes about upstream pstack, and why. If you are wondering
whether a difference from upstream is deliberate, it should be listed here.

## The rule

Everything in `./pstack` is generated. The tree is deleted and rebuilt on every
sync, so a hand-edit there survives exactly until the next run. To change the
output, change a rule in [`port/rules.mjs`](port/rules.mjs) or an overlay in
[`port/overlays/`](port/overlays/).

## Two layers, on purpose

**Rewrites** are the port. Cursor says `~/.cursor/skills/`, Claude Code says
`~/.claude/skills/`. Skipping one leaves an instruction pointing at a path that
does not exist, which an agent will follow anyway.

**Overlays** are opinion — additions we want on top of upstream. Skipping one
leaves a working plugin, just without our addition.

Both are content-addressed. A rewrite matches a token or a shape, never a line
number or a hunk of context, so upstream can reword the paragraph around it and
the rule still lands. Overlays only append a marked section; they never edit
inline and never renumber an upstream list.

That is the whole reason this mirror does not rot. It is not that upstream never
changes — it is that nothing here is anchored to upstream's current line
numbering.

## What gets rewritten

| Cursor                                              | Claude Code                                          |
| --------------------------------------------------- | ---------------------------------------------------- |
| `~/.cursor/rules/pstack-models.mdc` (always-applied) | `~/.claude/pstack-models.md` (plain markdown)         |
| `~/.cursor/skills/`, `~/.cursor/plugins/`            | `~/.claude/skills/`, `~/.claude/plugins/`             |
| `~/.cursor/projects/<slug>/agent-transcripts/…`      | `~/.claude/projects/<slug>/<uuid>.jsonl` (flat)       |
| `AskQuestion`                                        | `AskUserQuestion`                                    |
| `Task` tool / subagent                               | `Agent` tool / subagent                              |
| `alwaysApply:` frontmatter                           | dropped — no Claude Code equivalent                  |
| `/add-plugin pstack`                                 | `/plugin marketplace add …` + `/plugin install …`     |
| "Cursor's built-in X"                                | "your host's built-in X"                             |
| "Cursor's `/loop` command"                           | "the `/loop` skill"                                  |
| MCP discovery via an `mcps/` directory               | MCP servers as `mcp__<server>__<tool>` session tools |

Two of these deserve a note:

- **"your host's built-in."** Claude Code has no `create-skill` or `babysit`
  built-in. Renaming them to Claude Code would assert a skill that is not there,
  so the attribution goes generic and the sentence stays true either way.
- **Frontmatter names.** Claude Code requires a skill's frontmatter `name` to be
  its kebab-case directory slug. Upstream tolerates a display name
  (`name: Poteto Mode`). This is fixed structurally, for every skill, rather than
  as a one-off string patch, so a future upstream skill with the same problem is
  fixed on arrival.

The port also repairs grammar it breaks itself: renaming `Task` to `Agent`
strands the article in "a `Task` subagent". That rule runs last, on rewritten
text.

## Known gaps

Things that are ported but cannot work here. They are left in place rather than
deleted, because deleting them would break upstream's own cross-references, and
because a documented dead end is easier to reason about than a missing file.

- **The `orchestrate` playbook** (`skills/poteto-mode/playbooks/orchestrate.md`)
  is hard-wired to Cursor's cloud platform: `CURSOR_API_KEY`, `Agent.create`,
  `environment: "cloud"`, the Cursor agents dashboard. None of it exists in
  Claude Code. poteto-mode's routing to Orchestrate therefore dead-ends. The
  nearest native equivalent is Claude Code's built-in `Workflow` tool.
- **The benny automation pack** (`automations/benny/`) targets Cursor
  Automations and Cursor Slack actions. Upstream ships it dormant — its files
  are not registered as skills — and it stays dormant here. It is carried so
  upstream's README links resolve, not because it runs.
- **Model slugs.** Upstream's inline defaults are Cursor slugs
  (`grok-4.6-fast-xhigh`, `gpt-5.6-sol-max`, `claude-opus-5-thinking-xhigh`).
  None are valid in Claude Code, and the rewrite layer deliberately does not
  guess a mapping. Run `/pstack:setup-pstack` to write
  `~/.claude/pstack-models.md`, which overrides them. The
  `setup-pstack-claude-models` overlay documents the valid values inside the
  skill itself.

## Overlays currently applied

| Overlay                     | Target(s)                                                        | Why                                                                                     |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `setup-pstack-claude-models`| `skills/setup-pstack`                                            | Names the valid Claude Code model values; upstream's defaults are all invalid here.      |
| `user-level-skill-authoring`| `skills/automate-me`, `create-verification-skill`, `maintain-…`   | Generated skills go to `~/.claude/skills/`, not into a project's repo diff.              |
| `unslop-extra-patterns`     | `skills/unslop`                                                  | Adds "load-bearing", "seam", and "lands" to the pattern list.                            |

Disable one by setting `enabled: false` in its frontmatter, then re-syncing.

## The gate

[`port/verify.mjs`](port/verify.mjs) is what makes unattended mirroring safe. It
fails the build on any surviving `.cursor/` path, `agent-transcripts` reference,
Cursor-only frontmatter key, or wrong tool name; on a malformed manifest; on a
skill whose frontmatter `name` does not match its directory; and on a broken
relative link.

When upstream adds a Cursor-ism no rule covers, verify fails, CI publishes
nothing, and it opens an issue naming the file and line. A mirror that is a day
stale is recoverable. A mirror that silently ships instructions pointing at
`~/.cursor` is worse than no mirror, because an agent will follow them.

Loose mentions of "Cursor" are warnings, not errors — sometimes naming Cursor is
correct (attribution, documenting a Cursor-only feature). Allowlist entries each
carry a reason and, where the exemption is context-specific, a path pattern, so
the allowlist cannot quietly become a place to hide real misses.

## Attribution

pstack is by [Lauren Tan (poteto)](https://github.com/poteto), MIT licensed, from
[cursor/plugins](https://github.com/cursor/plugins). Upstream's own `LICENSE`
travels with the generated tree at `pstack/LICENSE`. This repository holds the
porting machinery and the generated output; it does not claim authorship of
pstack.
