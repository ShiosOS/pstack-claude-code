// Mechanical Cursor -> Claude Code transforms.
//
// Every rule is content-addressed: it matches a string or shape, never a line
// number or a hunk of context. Upstream can move text between files, add new
// skills, or rewrite paragraphs around these tokens and the rules still land.
// That is what keeps the port from going stale.
//
// A rule that stops matching is not an error (upstream may have dropped the
// text). A Cursor-ism that NO rule matches is an error, and verify.mjs is what
// catches it.

/** @type {{name: string, find: RegExp, replace: string | ((...a: string[]) => string)}[]} */
export const rewrites = [
	// ---------------------------------------------------------------- transcripts
	// Cursor: ~/.cursor/projects/<slug>/agent-transcripts/<uuid>/<uuid>.jsonl
	// Claude: ~/.claude/projects/<slug>/<uuid>.jsonl  (flat, one file per session)
	{
		name: 'transcript-full-path',
		find: /(\$HOME|~)\/\.cursor\/projects\/([^\/\s`"')]+)\/agent-transcripts\/<uuid>\/<uuid>\.jsonl/g,
		replace: '$1/.claude/projects/$2/<uuid>.jsonl',
	},
	{
		name: 'transcript-dir-path',
		find: /(\$HOME|~)\/\.cursor\/projects\/([^\/\s`"')]+)\/agent-transcripts\b/g,
		replace: '$1/.claude/projects/$2',
	},
	{
		name: 'transcript-prose-with-aside',
		find: /the active workspace's `agent-transcripts\/` directory \(the system prompt names (?:this|the) path\)/g,
		replace: "this workspace's transcript directory, `~/.claude/projects/<slug>/`",
	},
	{
		name: 'transcript-prose',
		find: /(?:the active|this) workspace's `agent-transcripts\/` directory/g,
		replace: "this workspace's transcript directory, `~/.claude/projects/<slug>/`",
	},
	{
		name: 'transcript-placeholder',
		find: /<agent-transcripts>/g,
		replace: '~/.claude/projects/<slug>',
	},
	{
		name: 'transcript-bare-token',
		find: /`agent-transcripts\/?`/g,
		replace: '`~/.claude/projects/<slug>/`',
	},

	// ------------------------------------------------------------- model config
	// Cursor always-applied rule file -> plain Claude Code markdown.
	{
		name: 'models-rule-file',
		find: /\.cursor\/rules\/pstack-models\.mdc/g,
		replace: '.claude/pstack-models.md',
	},
	{ name: 'cursor-rules-dir', find: /\.cursor\/rules\//g, replace: '.claude/' },

	// ------------------------------------------------------------------- paths
	{ name: 'plugins-dir', find: /\.cursor\/plugins\//g, replace: '.claude/plugins/' },
	{ name: 'skills-dir', find: /\.cursor\/skills\//g, replace: '.claude/skills/' },
	{ name: 'commands-dir', find: /\.cursor\/commands\//g, replace: '.claude/commands/' },
	{ name: 'projects-dir', find: /\.cursor\/projects\//g, replace: '.claude/projects/' },
	// Catch-all. Anything still under .cursor/ becomes .claude/; verify.mjs
	// reports whatever this had to touch so a new Cursor path gets a real rule.
	{ name: 'cursor-dir-catchall', find: /\.cursor\//g, replace: '.claude/' },

	// --------------------------------------------------------------- tool names
	{ name: 'ask-question-tool', find: /\bAskQuestion\b/g, replace: 'AskUserQuestion' },
	{ name: 'task-tool-backtick', find: /`Task`(\s+(?:tool|subagent))/g, replace: '`Agent`$1' },
	{ name: 'task-tool-prose', find: /\bthe Task tool\b/g, replace: 'the Agent tool' },
	{ name: 'task-tool-bare', find: /\bTask (tool|subagent)\b/g, replace: 'Agent $1' },
	{ name: 'todolist-tool', find: /`TodoWrite`|\btodolist\b/g, replace: 'todo list' },

	// ------------------------------------------------------- Cursor-only product
	{
		name: 'cursor-create-skill',
		find: /Use Cursor's built-in `create-skill` skill to author the skill\./g,
		replace:
			'Author the skill directly: a directory with a `SKILL.md` whose YAML frontmatter carries a kebab-case `name` and a `description` naming when to reach for it.',
	},
	{
		name: 'cursor-builtin-generic',
		find: /Cursor's built-in `([a-z-]+)` skill/g,
		replace: "the `$1` skill",
	},
];

/**
 * Structural fixes that are not string substitution.
 * Each gets (relativePath, text) and returns text.
 */
export const structural = [
	{
		name: 'skill-frontmatter-name-is-slug',
		// Claude Code requires the frontmatter `name` to be the kebab-case skill
		// slug. Cursor tolerates a display name ("Poteto Mode"). Force it to the
		// directory name so any future upstream skill is fixed too, not just the
		// ones that are wrong today.
		apply(relPath, text) {
			const m = relPath.match(/^skills\/(.+)\/SKILL\.md$/);
			if (!m) return text;
			const slug = m[1].split('/').pop();
			return text.replace(
				/^(---\r?\n(?:[\s\S]*?\r?\n)??)name:[ \t]*(.*)$/m,
				(full, head, current) => (current.trim() === slug ? full : `${head}name: ${slug}`),
			);
		},
	},
	{
		name: 'strip-cursor-always-apply',
		// `alwaysApply` is Cursor rule frontmatter. Claude Code has no equivalent;
		// a stray key is noise at best and a frontmatter parse risk at worst.
		apply(relPath, text) {
			return text.replace(/^alwaysApply:[ \t]*\S+[ \t]*\r?\n/gm, '');
		},
	},
	{
		name: 'strip-mdc-rule-frontmatter-in-fences',
		// setup-pstack shows the file it should WRITE inside a code fence. In
		// Cursor that sample carries .mdc rule frontmatter; the Claude Code file
		// is plain markdown, so the sample must not tell the agent to emit it.
		apply(relPath, text) {
			return text.replace(
				/^---\r?\ndescription: pstack per-role model choices \(overrides skill defaults\)\r?\n\r?\n?---\r?\n/gm,
				'',
			);
		},
	},
];
