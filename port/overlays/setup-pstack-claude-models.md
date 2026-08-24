---
target: skills/setup-pstack/SKILL.md
enabled: true
---

## Claude Code model values

The role defaults quoted above are Cursor model slugs (`grok-4.6-fast-xhigh`,
`gpt-5.6-sol-max`, `claude-opus-5-thinking-xhigh`). None of them are valid here.

In Claude Code the only values you may write are the `Agent` tool's model enum:

- `opus`, `sonnet`, `haiku`, `fable`
- plus the `inherit-parent` and `auto` aliases

Reasoning effort is a separate axis in Claude Code (`effort`), not part of the
model name, so it cannot be expressed in `~/.claude/pstack-models.md`. Drop the
`-thinking-xhigh` / `-max` suffixes rather than trying to encode them.

Panel roles take a list, and the list length sets the fan-out — one subagent per
entry. A single-model panel defeats the point of cross-judging, so keep at least
two families in any list.
