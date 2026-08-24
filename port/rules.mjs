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

// This repo, used to rewrite upstream's install instructions.
export const PORT_REPO = 'ShiosOS/pstack-claude-code';

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
		// Upstream explains the slug in POSIX terms only. On Windows the drive
		// colon collapses too, which changes the directory you actually look in.
		name: 'transcript-slug-windows',
		find: /\(so `\/Users\/you\/proj` becomes `Users-you-proj`\)/g,
		replace:
			'(so `/Users/you/proj` becomes `Users-you-proj`; on Windows the drive colon collapses as well, so `D:\\repos\\proj` becomes `D--repos-proj`)',
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
	// A backticked `Task` is always the tool, whatever follows it. Upstream also
	// writes it bare ("Spawn `Task` with subagent_type"), which a rule keyed on a
	// following "tool"/"subagent" misses entirely.
	{ name: 'task-tool-backtick', find: /`Task`/g, replace: '`Agent`' },
	{ name: 'task-tool-prose', find: /\bthe Task tool\b/g, replace: 'the Agent tool' },
	{ name: 'task-tool-bare', find: /\bTask (tool|subagent)\b/g, replace: 'Agent $1' },
	// "Task schema" in the orchestrate playbook is deliberately left alone: it
	// describes Cursor's cloud Task schema (`environment: "cloud"`), which the
	// Agent tool has no counterpart for. See PORT.md, known gaps.
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
	// Claude Code has no `create-skill` or `babysit` built-in, and its wake
	// mechanism is the `/loop` skill rather than a Cursor command. Attributing
	// these to "your host" keeps the sentence true on either platform instead of
	// asserting a built-in that is not there.
	{ name: 'cursor-builtin-attribution', find: /Cursor's built-in/g, replace: "your host's built-in" },
	{ name: 'cursor-loop-command', find: /[Cc]ursor's `\/loop` command/g, replace: 'the `/loop` skill' },

	// ------------------------------------------------------------ install prose
	{ name: 'install-prose', find: /In a Cursor chat, run:/g, replace: 'In Claude Code, run:' },
	{
		name: 'install-command',
		find: /\/add-plugin pstack/g,
		replace: `/plugin marketplace add ${PORT_REPO}\n/plugin install pstack@pstack-claude-code`,
	},
	{
		name: 'install-confirm',
		find: /Cursor confirms the plugin is installed\./g,
		replace: 'Claude Code confirms the plugin is installed.',
	},

	// ------------------------------------------------------------- host naming
	{ name: 'cursor-restart-noun', find: /\ba Cursor restart\b/g, replace: 'a Claude Code restart' },
	{ name: 'cursor-restart-verb', find: /\brestart Cursor\b/g, replace: 'restart Claude Code' },
	{
		name: 'cursor-models-api',
		find: /If Cursor also exposes a models API/g,
		replace: 'If your host also exposes a models API',
	},
	{ name: 'cursor-possessive-lc', find: /\bcursor's\b/g, replace: "Claude Code's" },
	{ name: 'point-cursor-at', find: /\bpoint cursor at\b/g, replace: 'point Claude Code at' },
	{ name: 'turns-cursor-into', find: /\bturns cursor into\b/g, replace: 'turns Claude Code into' },
	{ name: 'make-cursor-work', find: /\bmake cursor work\b/g, replace: 'make Claude Code work' },

	// Claude Code surfaces MCP servers as tools in the session rather than as a
	// `mcps/` directory on disk, so the discovery instruction has to change, not
	// just the product name.
	{
		name: 'mcp-discovery',
		find: /list the available MCPs from the Cursor environment\. Use the available-tools map when present\. Otherwise inspect the `mcps\/` directory Cursor exposes for enabled MCP servers\./g,
		replace:
			'list the MCP servers available in this session. Their tools appear as `mcp__<server>__<tool>` entries in the tool list; use `ToolSearch` to enumerate them when they are deferred rather than listed up front.',
	},

	// ------------------------------------------------------------ grammar repair
	// Renaming a word can strand the article in front of it: Cursor's
	// "a `Task` subagent" becomes "a `Agent` subagent" once task-tool-* runs.
	// Must stay last so it sees the rewritten text.
	{ name: 'article-before-agent', find: /\ba (`?Agent`?\s+(?:tool|subagent))/g, replace: 'an $1' },
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
