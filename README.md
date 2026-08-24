# pstack for Claude Code

A Claude Code port of [pstack](https://github.com/cursor/plugins/tree/main/pstack),
mirrored from `cursor/plugins` and re-generated daily so it does not fall behind
upstream.

44 skills and 2 agents: `/pstack:how`, `/pstack:why`, `/pstack:unslop`,
`/pstack:arena`, `/pstack:interrogate`, `/pstack:swarm`, `/pstack:poteto-mode`,
the `principle-*` family, and the rest.

## Install

```text
/plugin marketplace add ShiosOS/pstack-claude-code
/plugin install pstack@pstack-claude-code
```

Then pick your models — upstream's defaults are Cursor slugs and none of them
are valid here:

```text
/pstack:setup-pstack
```

That writes `~/.claude/pstack-models.md`, which every pstack skill reads and
which overrides the inline defaults. Valid values are the `Agent` tool's model
enum — `opus`, `sonnet`, `haiku`, `fable` — plus the `inherit-parent` and `auto`
aliases.

> Already running pstack via a local junction or a hand-patched clone? Remove it
> first. Two plugins both named `pstack` will collide.

## Why this exists

pstack is a Cursor plugin. Its skills reference `~/.cursor/` paths, Cursor's tool
names, Cursor's transcript layout, and Cursor-only built-ins. Hand-patching a
clone works exactly once: the patches are edits to tracked files, so the next
`git pull` conflicts, and the port quietly drifts from upstream.

So the port is not a patch set. It is a **transform** plus a **gate**:

- [`port/rules.mjs`](port/rules.mjs) — content-addressed rewrites. Each matches a
  token or a shape, never a line number. Upstream can reword the surrounding
  paragraph, move text between files, or add whole skills, and the rules still
  apply.
- [`port/verify.mjs`](port/verify.mjs) — refuses to publish a tree that still
  contains a `.cursor/` path, the wrong tool name, a malformed manifest, a skill
  whose frontmatter name does not match its directory, a broken link, a script
  that lost its executable bit, or a generated file that is not tracked.
- [`.github/workflows/mirror.yml`](.github/workflows/mirror.yml) — runs both
  daily, commits when the output changes, and opens an issue when the gate trips.

The gate is the load-bearing part. Upstream *will* eventually introduce a
Cursor-ism no rule covers. When that happens this fails loudly and publishes
nothing, rather than shipping an instruction pointing at a path that does not
exist — which an agent would follow anyway. A mirror that is a day stale is
recoverable; a confidently wrong one is not.

[`PORT.md`](PORT.md) is the full contract: every rewrite, every deliberate
deviation, and the three things that are ported but cannot work here
(Cursor-cloud orchestration, the benny automation pack, upstream's model slugs).

## Layout

```
.claude-plugin/marketplace.json   the marketplace entry
pstack/                           GENERATED — the ported plugin
port/rules.mjs                    Cursor -> Claude Code rewrites
port/overlays/                    optional local additions (mostly off)
port/sync.mjs                     fetch upstream, re-port, record provenance
port/verify.mjs                   the gate
UPSTREAM.json                     which upstream commit this was built from
```

**Do not edit `pstack/` by hand.** It is deleted and rebuilt from scratch on
every sync, so edits are lost. Change a rule or an overlay instead — which means
the output can never disagree with what the rules say it should be.

## Updating by hand

```bash
node port/sync.mjs                 # re-port from upstream main
git add -A pstack UPSTREAM.json    # stage first — see below
node port/verify.mjs               # gate it
node port/sync.mjs --check         # exit 1 if the port is out of date
node port/sync.mjs --ref <sha>     # pin a specific upstream commit
node port/sync.mjs --from ../clone # re-port from a local clone, offline
```

Stage before verifying. Two of verify's checks read what git recorded rather than
what is on disk, because that is where the failure would actually be: a script
that lost its executable bit, and a generated file a `.gitignore` pattern would
hide from everyone who installs the plugin. On Windows, `chmod` does not stick, so
a newly-executable upstream script needs `git update-index --chmod=+x` once —
verify prints the exact command.

`sync.mjs` prints which rules fired and on how many files, and reports rules that
matched nothing — usually a sign upstream dropped the text, occasionally a sign a
rule has gone stale.

## Adding a rule

When verify reports something unported:

1. Add an entry to `rewrites` in [`port/rules.mjs`](port/rules.mjs). Match the
   narrowest stable token that identifies it, not the surrounding sentence.
2. `node port/sync.mjs && node port/verify.mjs`.
3. Commit the rule and the regenerated tree together.

If the reference is *correct* as-is — attribution, or documentation of a
Cursor-only feature — add an allowlist entry in `port/verify.mjs` instead, with a
reason and, where it is context-specific, a `path` pattern.

## Credits

pstack is by [Lauren Tan (poteto)](https://github.com/poteto) and is MIT
licensed. This repository is the porting machinery and its generated output; it
does not claim authorship of pstack. Upstream's licence travels with the
generated tree at [`pstack/LICENSE`](pstack/LICENSE).
