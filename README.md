# pstack for Claude Code

A Claude Code port of [pstack](https://github.com/cursor/plugins/tree/main/pstack).
A GitHub Action re-ports it from `cursor/plugins` every day, so it does not fall
behind upstream.

44 skills and 2 agents: `/pstack:how`, `/pstack:why`, `/pstack:unslop`,
`/pstack:arena`, `/pstack:interrogate`, `/pstack:swarm`, `/pstack:poteto-mode`,
the `principle-*` family, and the rest.

## Install

```text
/plugin marketplace add ShiosOS/pstack-claude-code
/plugin install pstack@pstack-claude-code
```

Then pick your models. Upstream's defaults are Cursor slugs, and none of them are
valid here:

```text
/pstack:setup-pstack
```

That writes `~/.claude/pstack-models.md`. Every pstack skill reads that file, and
it overrides the inline defaults. Valid values are the `Agent` tool's model enum,
so `opus`, `sonnet`, `haiku`, `fable`, plus the `inherit-parent` and `auto`
aliases.

> Already running pstack via a local junction or a hand-patched clone? Remove it
> first. Two plugins both named `pstack` will collide.

## Why this exists

pstack is a Cursor plugin. Its skills reference `~/.cursor/` paths, Cursor's tool
names, Cursor's transcript layout, and Cursor-only built-ins. Hand-patching a
clone works exactly once. The patches are edits to tracked files, so the next
`git pull` conflicts, and from there the port drifts.

So the port is not a patch set. Three files do all of it:

- [`port/rules.mjs`](port/rules.mjs) holds content-addressed rewrites. Each one
  matches a token or a shape, never a line number. Upstream can reword the
  surrounding paragraph, move text between files, or add whole skills, and the
  rules still apply.
- [`port/verify.mjs`](port/verify.mjs) refuses to publish a tree that still
  contains a `.cursor/` path, the wrong tool name, a malformed manifest, a skill
  whose frontmatter name does not match its directory, a broken link, a script
  that lost its executable bit, or a generated file that is not tracked.
- [`.github/workflows/mirror.yml`](.github/workflows/mirror.yml) runs both daily,
  commits when the output changes, and opens an issue when verify fails.

Verify is why this mirror is safe to install unattended. Upstream *will*
eventually introduce a Cursor-ism no rule covers. When that happens the build
fails and publishes nothing, instead of shipping an instruction that points at a
path which does not exist. An agent reading that instruction would follow it
anyway. A mirror one day stale is recoverable. A wrong one is not.

[`PORT.md`](PORT.md) is the full contract. It lists every rewrite and every
deliberate deviation, plus the three things that are ported but cannot work here:
Cursor-cloud orchestration, the benny automation pack, and upstream's model
slugs.

## Layout

```
.claude-plugin/marketplace.json   the marketplace entry
pstack/                           GENERATED, the ported plugin
port/rules.mjs                    Cursor -> Claude Code rewrites
port/overlays/                    optional local additions, most disabled
port/sync.mjs                     fetch upstream, re-port, record provenance
port/verify.mjs                   refuses to publish a broken port
UPSTREAM.json                     which upstream commit this was built from
```

**Do not edit `pstack/` by hand.** `sync.mjs` deletes the directory and rebuilds
it from scratch every run, so hand edits are lost. Change a rule or an overlay
instead. That way the output cannot disagree with what the rules say it should
be.

## Updating by hand

```bash
node port/sync.mjs                 # re-port from upstream main
git add -A pstack UPSTREAM.json    # stage first, see below
node port/verify.mjs               # check it
node port/sync.mjs --check         # exit 1 if the port is out of date
node port/sync.mjs --ref <sha>     # pin a specific upstream commit
node port/sync.mjs --from ../clone # re-port from a local clone, offline
```

Stage before verifying. Two of verify's checks read what git recorded rather than
what sits on disk, because git is where those two failures show up: a script that
lost its executable bit, and a generated file that a `.gitignore` pattern would
hide from everyone installing the plugin. On Windows `chmod` does not stick, so
an upstream script that newly becomes executable needs one
`git update-index --chmod=+x`. Verify prints the exact command.

`sync.mjs` prints which rules fired and on how many files, and it names rules
that matched nothing. That usually means upstream dropped the text. Sometimes it
means the rule has gone stale.

## Adding a rule

When verify reports something unported:

1. Add an entry to `rewrites` in [`port/rules.mjs`](port/rules.mjs). Match the
   narrowest stable token that identifies it, not the surrounding sentence.
2. `node port/sync.mjs && node port/verify.mjs`.
3. Commit the rule and the regenerated tree together.

Sometimes the reference is right as it stands, either attribution or
documentation of a Cursor-only feature. Add an allowlist entry to
`port/verify.mjs` instead, with a reason and, where it is context-specific, a
`path` pattern.

## Credits

pstack is by [Lauren Tan (poteto)](https://github.com/poteto) and is MIT
licensed. This repository is the porting machinery and its generated output; it
does not claim authorship of pstack. Upstream's licence ships inside the
generated tree at [`pstack/LICENSE`](pstack/LICENSE).
