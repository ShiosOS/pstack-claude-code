---
target: skills/automate-me/SKILL.md, skills/create-verification-skill/SKILL.md, skills/maintain-verification-skill/SKILL.md
enabled: false
---

## Where generated skills go

Write generated skills to the user level, `~/.claude/skills/<name>/`, not to a
project's `.claude/skills/`. A generated skill in the repo shows up in every
diff, review, and blame for work it has nothing to do with, and it follows the
branch instead of following you.

Read from both locations — a project may legitimately ship its own skills — but
create and update at the user level unless the user explicitly asks for a
skill committed to the repo.
