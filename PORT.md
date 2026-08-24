# The port contract

What this port changes about upstream pstack, and why. If you are wondering
whether a difference from upstream is deliberate, it should be listed here.

## The rule

Everything in `./pstack` is generated. `port/sync.mjs` deletes the tree and
rebuilds it on every run, so a hand edit there survives exactly until the next
one. To change the
output, change a rule in [`port/rules.mjs`](port/rules.mjs) or an overlay in
[`port/overlays/`](port/overlays/).

## Two layers, on purpose

**Rewrites** are the port. Cursor says `~/.cursor/skills/`, Claude Code says
`~/.claude/skills/`. Skipping one leaves an instruction pointing at a path that
does not exist, which an agent will follow anyway.

**Overlays** are opinion, additions on top of upstream. Skipping one leaves a
working plugin without the addition. This port is meant to read as upstream wrote
it, so overlays ship off unless the content fixes the port rather than adding to
it. See [Overlays](#overlays).

Both are content-addressed. A rewrite matches a token or a shape, never a line
number or a hunk of context, so upstream can reword the paragraph around it and
the rule still applies. Overlays only append a marked section. They never edit
inline and never renumber an upstream list.

That is why this mirror does not rot. Upstream changes constantly. Nothing here
is anchored to upstream's line numbering, so those changes do not reach the port.

## What gets rewritten

| Cursor                                              | Claude Code                                          |
| --------------------------------------------------- | ---------------------------------------------------- |
| `~/.cursor/rules/pstack-models.mdc` (always-applied) | `~/.claude/pstack-models.md` (plain markdown)         |
| `~/.cursor/skills/`, `~/.cursor/plugins/`            | `~/.claude/skills/`, `~/.claude/plugins/`             |
| `~/.cursor/projects/<slug>/agent-transcripts/…`      | `~/.claude/projects/<slug>/<uuid>.jsonl` (flat)       |
| `AskQuestion`                                        | `AskUserQuestion`                                    |
| `Task` tool / subagent, and bare `` `Task` ``        | `Agent`                                              |
| `todolist`                                           | todo list, naming `TodoWrite` where one is opened    |
| `alwaysApply:` frontmatter                           | dropped, no Claude Code equivalent                   |
| `/add-plugin pstack`                                 | `/plugin marketplace add …` + `/plugin install …`     |
| "Cursor's built-in X"                                | "your host's built-in X"                             |
| "Cursor's `/loop` command"                           | "the `/loop` skill"                                  |
| MCP discovery via an `mcps/` directory               | MCP servers as `mcp__<server>__<tool>` session tools |

Two of these deserve a note:

- **"your host's built-in."** Claude Code has no `create-skill` or `babysit`
  built-in. Renaming them to Claude Code would assert a skill that is not there,
  so the attribution goes generic and the sentence stays true on either host.
- **Frontmatter names.** Claude Code requires a skill's frontmatter `name` to be
  its kebab-case directory slug. Upstream tolerates a display name
  (`name: Poteto Mode`). A structural rule fixes every skill rather than patching
  the strings that are wrong today, so a future upstream skill with the same
  problem gets fixed on arrival.

The port also repairs grammar it breaks itself. Renaming `Task` to `Agent`
strands the article in "a `Task` subagent", so that rule runs last, on rewritten
text.

## Known gaps

Things that are ported but cannot work here. They stay in place rather than
getting deleted, because deleting them would break upstream's own
cross-references, and because a documented dead end is easier to reason about
than a missing file.

- **The `orchestrate` playbook** (`skills/poteto-mode/playbooks/orchestrate.md`)
  is hard-wired to Cursor's cloud platform: `CURSOR_API_KEY`, `Agent.create`,
  `environment: "cloud"`, the Cursor agents dashboard. None of it exists in
  Claude Code, so poteto-mode's routing to Orchestrate dead-ends. The nearest
  native equivalent is Claude Code's built-in `Workflow` tool.
- **The benny automation pack** (`automations/benny/`) targets Cursor
  Automations and Cursor Slack actions. Upstream ships it dormant, with its files
  unregistered as skills, and it stays dormant here. It is carried so upstream's
  README links resolve, not because it runs.
- **Model slugs.** Upstream's inline defaults are Cursor slugs
  (`grok-4.6-fast-xhigh`, `gpt-5.6-sol-max`, `claude-opus-5-thinking-xhigh`).
  None are valid in Claude Code, and the rewrite layer deliberately does not
  guess a mapping. Run `/pstack:setup-pstack` to write
  `~/.claude/pstack-models.md`, which overrides them. The
  `setup-pstack-claude-models` overlay documents the valid values inside the
  skill itself.

## Overlays

| Overlay                      | Status   | Target(s)                                                      |
| ---------------------------- | -------- | -------------------------------------------------------------- |
| `setup-pstack-claude-models` | on       | `skills/setup-pstack`                                          |
| `user-level-skill-authoring` | off      | `skills/automate-me`, `create-verification-skill`, `maintain-…` |
| `unslop-extra-patterns`      | off      | `skills/unslop`                                                |

Two of the three ship disabled, because a faithful mirror should read as upstream
wrote it. `unslop-extra-patterns` adds pattern entries upstream does not have.
`user-level-skill-authoring` redirects generated skills to `~/.claude/skills/`
instead of the project. That is a defensible preference, but it contradicts
upstream's own `docs/guide/06-verify-and-ship.md`, which documents the project
path, and shipping both would have put the plugin at odds with itself.

`setup-pstack-claude-models` stays on because it is not opinion. Upstream's
`setup-pstack` instructs the agent to write model slugs that do not exist in
Claude Code, which is the same class of defect as a `~/.cursor/` path, an
instruction an agent will follow into a wall. The overlay names the valid values
without guessing a slug-to-slug mapping, which the rewrite layer still refuses to
do.

Turn one on with `enabled: true` in its frontmatter, then re-sync. Both stay in
[`port/overlays/`](port/overlays/), off rather than deleted.

## What verify refuses

[`port/verify.mjs`](port/verify.mjs) is what makes unattended mirroring safe. It
fails the build on any surviving `.cursor/` path, `agent-transcripts` reference,
Cursor-only frontmatter key, or wrong tool name; on a malformed manifest; on a
skill whose frontmatter `name` does not match its directory; and on a broken
relative link.

Two of its checks look at the committed tree rather than the tree on disk,
because both failure modes are invisible locally:

- **Executable bits.** Upstream ships four runnable scripts. `chmod` is a no-op
  on Windows, so `UPSTREAM.json` records the mode and verify asserts it against
  `git ls-files -s`, printing the `git update-index --chmod=+x` fix in the error.
  A script that arrives mode `100644` does not run for anyone who installs the
  plugin.
- **Tracking.** Every generated file must be tracked. A future upstream filename
  matching a `.gitignore` pattern would be present here and absent for everyone
  else, and nothing else in the pipeline would notice.

When upstream adds a Cursor-ism no rule covers, verify fails, CI publishes
nothing, and it opens an issue naming the file and line. A mirror one day stale
is recoverable. A mirror that ships instructions pointing at `~/.cursor` is worse
than no mirror, because an agent will follow them.

Loose mentions of "Cursor" are warnings rather than errors, since naming Cursor
is sometimes correct, as in attribution or documentation of a Cursor-only
feature. Every allowlist entry carries a reason, plus a path pattern where the
exemption is context-specific, so the allowlist cannot become a place to hide
real misses.

## Attribution

pstack is by [Lauren Tan (poteto)](https://github.com/poteto), MIT licensed, from
[cursor/plugins](https://github.com/cursor/plugins). Upstream's own `LICENSE`
ships in the generated tree at `pstack/LICENSE`. This repository holds the
porting machinery and the generated output; it does not claim authorship of
pstack.
