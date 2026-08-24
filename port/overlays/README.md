# Overlays

Local content additions. `../sync.mjs` applies these after the mechanical
rewrites in `../rules.mjs`.

The distinction matters:

- **Rewrites** are the *port*. Cursor says `~/.cursor/skills/`, Claude Code says
  `~/.claude/skills/`. Not applying one leaves a broken instruction.
- **Overlays** are *opinion*. Extra prose we want on top of upstream. Dropping
  one leaves a plugin that still works, just without our addition.

Every overlay appends a marked section to the end of its target. It never edits
inline and never renumbers an upstream list, because an anchored edit is exactly
what breaks when upstream rewords a paragraph. Appending repeats a little text
and survives any rewording.

Frontmatter:

| key      | meaning                                                        |
| -------- | -------------------------------------------------------------- |
| `target` | path(s) inside the plugin, comma-separated. Must already exist. |
| `enabled`| `false` to keep the file but skip applying it.                  |

A `target` that does not exist is a hard error rather than a silent skip. It
means upstream moved or deleted the file, and someone has to decide whether to
retarget the overlay or drop it.
