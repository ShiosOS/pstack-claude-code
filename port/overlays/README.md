# Overlays

Local content additions, applied after the mechanical rewrites in `../rules.mjs`.

The distinction matters:

- **Rewrites** are the *port*. Cursor says `~/.cursor/skills/`, Claude Code says
  `~/.claude/skills/`. Not applying one leaves a broken instruction.
- **Overlays** are *opinion*. Extra prose we want on top of upstream. Dropping
  one leaves a plugin that still works, just without our addition.

Every overlay appends a clearly-marked section to the end of its target. It never
edits inline and never renumbers an upstream list, because an anchored edit is
exactly the thing that breaks when upstream rewords a paragraph. Appending costs
a little redundancy and buys immunity to upstream drift.

Frontmatter:

| key      | meaning                                                        |
| -------- | -------------------------------------------------------------- |
| `target` | path(s) inside the plugin, comma-separated. Must already exist. |
| `enabled`| `false` to keep the file but skip applying it.                  |

A `target` that does not exist is a hard error, not a silent skip: it means
upstream moved or deleted the file and the overlay needs a human decision.
