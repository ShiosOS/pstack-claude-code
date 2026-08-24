# Security

## Where to report what

pstack's own behaviour belongs upstream at
[cursor/plugins](https://github.com/cursor/plugins/issues). This repository
rewrites and republishes it, so a skill that gives bad advice in Cursor gives the
same advice here.

Report to this repository what the port itself introduces:

- A generated skill that points at a path or a tool that does not exist. An
  agent will act on that instruction anyway, which is the whole reason
  `port/verify.mjs` fails the build over it.
- A rewrite in `port/rules.mjs` that changed what an instruction means, rather
  than which product it names.
- Anything in `port/` or `.github/` that would let text fetched from upstream
  reach this repository's write token.

Open a normal issue for the first two. For the third, use private vulnerability
reporting on the Security tab, so a fix ships before the details do.

## What the mirror runs

Nothing from upstream. `port/sync.mjs` fetches the `pstack/` subdirectory with a
blobless sparse checkout, reads the files, rewrites text, and writes the result.
It never executes them, and the workflow installs no dependencies.

## What the plugin does once installed

pstack ships shell and TypeScript scripts that its skills ask an agent to run,
four of them executable. Read them first if that matters where you work.
`UPSTREAM.json` names the exact upstream commit every file came from, so you can
diff the published tree against `cursor/plugins` yourself.
