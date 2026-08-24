# Contributing

`pstack/` is generated. `port/sync.mjs` deletes the whole directory and rebuilds
it from upstream on every run, so a pull request that edits a file under
`pstack/` loses that edit the next time the mirror runs. Change a rule instead.

## Reporting an unported reference

If a skill tells you to look in `~/.cursor/`, names a Cursor tool, or points at
something Claude Code does not have, open an issue with the file, the line, and
what it should say.

The daily mirror already opens its own issue when `port/verify.mjs` catches an
unported pattern. So an issue from a person usually means verify missed one,
which is worth knowing on its own.

## Adding a rewrite rule

1. Add an entry to `rewrites` in `port/rules.mjs`. Match the narrowest stable
   token that identifies the thing. Never a line number, never a surrounding
   sentence. Upstream rewords prose and moves text between files, and a rule
   that depends on either breaks the next time it happens.
2. Run `node port/sync.mjs && node port/verify.mjs`.
3. Commit the rule and the regenerated `pstack/` in one commit. A rule without
   its output leaves the published plugin disagreeing with the rules that made
   it.

Rules run in order, and `article-before-agent` stays last. It repairs the
articles that earlier renames strand, so a rule added below it would run on text
that rule has already fixed.

## When the Cursor reference is correct

Some references should stay. Attribution is one. Documentation of a Cursor-only
feature with no Claude Code counterpart is another, and `PORT.md` lists the three
that exist today. Add an entry to `ALLOW` in `port/verify.mjs` with a `why`
string, plus a `path` pattern when it applies to one file rather than every file.

## Overlays

An overlay in `port/overlays/` appends a block to a generated skill. One ships
enabled, because upstream's model defaults are Cursor slugs and none of them work
here. The rest are off.

This repository is meant to be a faithful mirror, so an overlay that adds an
opinion rather than fixing the port will be turned off or turned down. Keep your
own additions in `~/.claude/skills/`, where a re-sync cannot overwrite them.

## Running it locally

```bash
node port/sync.mjs --from ../plugins   # re-port from a local clone, no network
git add -A pstack UPSTREAM.json        # stage first
node port/verify.mjs
```

Stage before verifying. Two of verify's checks read the git index rather than the
working tree, because an executable bit and a `.gitignore` match only matter in
what git recorded. On Windows `chmod` does nothing, so a script that upstream
newly marks executable needs one `git update-index --chmod=+x`. Verify prints
the command.

Pull requests get the same treatment automatically. `.github/workflows/check.yml`
re-ports at the upstream commit your branch recorded, runs verify, and fails if
the committed `pstack/` is not what the rules produce.
