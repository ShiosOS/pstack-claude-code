#!/usr/bin/env node
// Check the generated port. Exits non-zero on anything that would ship broken.
//
//   node port/verify.mjs
//
// This is the piece that makes an automated mirror safe. sync.mjs applies the
// rules it knows; verify.mjs asserts that nothing Cursor-specific survived and
// that the result is a well-formed Claude Code plugin. When upstream introduces
// a Cursor-ism no rule covers, this fails and CI refuses to publish, instead of
// shipping instructions that point at paths which do not exist here.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'pstack');

const errors = [];
const warnings = [];

// Occurrences that are correct as-is. Each entry carries a reason, because an
// allowlist without reasons becomes a place to hide real failures. `path` scopes
// an entry to files where the exemption actually applies.
const ALLOW = [
	{
		pattern: /cursor\/plugins/,
		why: 'upstream repo URL — correct to reference in provenance and attribution',
	},
	{
		pattern: /cursor\.com\/(?:agents|docs|dashboard)|Cursor dashboard/,
		why: 'Cursor cloud, documented in the orchestrate playbook; no Claude Code equivalent',
	},
	{ pattern: /CURSOR_API_KEY/, why: 'Cursor cloud credential, documented not used' },
	{ pattern: /`?Agent\.create`?/, why: 'Cursor cloud SDK call named in the orchestrate playbook' },
	{ pattern: /cursor-team-kit/, why: 'sibling Cursor plugin referenced by name only' },
	{
		pattern: /Application Support\/Cursor/,
		why: 'host editor cache path in a disk-reclaim checklist',
	},
	{
		path: /^automations\//,
		pattern: /Cursor/,
		why: 'the benny pack targets Cursor Automations and Cursor Slack actions; dormant here (see PORT.md)',
	},
	{
		path: /^README\.md$/,
		pattern: /[Cc]ursor/,
		why: "upstream author's bio and marketing copy; attribution, not instruction",
	},
	{
		pattern: /are Cursor model slugs/,
		why: 'port overlay naming the upstream defaults in order to say they are invalid here',
	},
];

const allowed = (relPath, line) =>
	ALLOW.some((a) => (!a.path || a.path.test(relPath)) && a.pattern.test(line));

// Tokens that must not survive the port.
const FORBIDDEN = [
	{ name: 'cursor-dotdir', pattern: /\.cursor[\/\\]/, hint: 'add a path rule in rules.mjs' },
	{ name: 'cursor-transcripts', pattern: /agent-transcripts/, hint: 'transcript layout differs in Claude Code' },
	{ name: 'cursor-rule-frontmatter', pattern: /^alwaysApply:/m, hint: 'Cursor-only frontmatter key' },
	{ name: 'cursor-mdc-file', pattern: /\.mdc\b/, hint: 'Cursor rule extension; Claude Code uses .md' },
	{ name: 'ask-question-tool', pattern: /\bAskQuestion\b/, hint: 'Claude Code tool is AskUserQuestion' },
	{ name: 'task-tool', pattern: /\bTask (?:tool|subagent)\b/, hint: 'Claude Code tool is Agent' },
	// Upstream also writes it bare — "Spawn `Task` with subagent_type" — which a
	// pattern keyed on a following "tool"/"subagent" never sees.
	{ name: 'task-tool-backtick', pattern: /`Task`/, hint: 'Claude Code tool is `Agent`' },
];

function walk(dir, base = '') {
	const out = [];
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const rel = base ? base + '/' + e.name : e.name;
		const full = path.join(dir, e.name);
		if (e.isDirectory()) out.push(...walk(full, rel));
		else out.push({ rel, full });
	}
	return out;
}

if (!fs.existsSync(OUT)) {
	console.error('no generated plugin at ./pstack — run: node port/sync.mjs');
	process.exit(1);
}

// Content sniffing, matching sync.mjs. An extension allowlist would skip
// upstream's extensionless scripts, so a Cursor path added to one would pass
// unchecked.
const BINARY_EXT = new Set([
	'.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.pdf',
	'.woff', '.woff2', '.ttf', '.otf', '.zip', '.gz', '.mp4', '.mov',
]);

function isText(file) {
	if (BINARY_EXT.has(path.extname(file).toLowerCase())) return false;
	const fd = fs.openSync(file, 'r');
	try {
		const buf = Buffer.alloc(8000);
		const read = fs.readSync(fd, buf, 0, 8000, 0);
		return !buf.subarray(0, read).includes(0);
	} finally {
		fs.closeSync(fd);
	}
}

const files = walk(OUT);
const textFiles = files.filter((f) => isText(f.full));

// ------------------------------------------------------------ forbidden tokens

for (const f of textFiles) {
	const lines = fs.readFileSync(f.full, 'utf8').split('\n');
	lines.forEach((line, i) => {
		for (const rule of FORBIDDEN) {
			if (!rule.pattern.test(line)) continue;
			if (allowed(f.rel, line)) continue;
			errors.push(`${f.rel}:${i + 1}  [${rule.name}] ${rule.hint}\n      ${line.trim()}`);
		}
	});
}

// Loose "Cursor" prose is a warning, not an error: sometimes naming Cursor is
// correct (attribution, documenting a Cursor-only feature), sometimes it is a
// missed rewrite. A human should look, but it should not block the mirror.
for (const f of textFiles) {
	const lines = fs.readFileSync(f.full, 'utf8').split('\n');
	lines.forEach((line, i) => {
		if (!/\bCursor(?:'s)?\b/.test(line)) return;
		if (allowed(f.rel, line)) return;
		warnings.push(`${f.rel}:${i + 1}  mentions Cursor — confirm it should\n      ${line.trim()}`);
	});
}

// --------------------------------------------------------------- plugin shape

const manifestPath = path.join(OUT, '.claude-plugin', 'plugin.json');
if (!fs.existsSync(manifestPath)) {
	errors.push('.claude-plugin/plugin.json is missing');
} else {
	let manifest;
	try {
		manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
	} catch (e) {
		errors.push(`.claude-plugin/plugin.json is not valid JSON: ${e.message}`);
	}
	if (manifest) {
		if (manifest.name !== 'pstack') errors.push(`plugin name is "${manifest.name}", expected "pstack"`);
		if (!/^\d+\.\d+\.\d+/.test(manifest.version ?? '')) {
			errors.push(`plugin version "${manifest.version}" is not semver`);
		}
		for (const key of ['skills', 'agents', 'displayName', 'category', 'tags']) {
			if (key in manifest) errors.push(`plugin.json carries Cursor-only key "${key}"`);
		}
	}
}

if (fs.existsSync(path.join(OUT, '.cursor-plugin'))) {
	errors.push('.cursor-plugin/ leaked into the generated plugin');
}

// ------------------------------------------------------------ skill frontmatter

const skillsDir = path.join(OUT, 'skills');
const skillDirs = fs.existsSync(skillsDir)
	? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory())
	: [];

if (skillDirs.length === 0) errors.push('no skills found — the port produced an empty plugin');

for (const d of skillDirs) {
	const skillMd = path.join(skillsDir, d.name, 'SKILL.md');
	if (!fs.existsSync(skillMd)) {
		errors.push(`skills/${d.name}/ has no SKILL.md`);
		continue;
	}
	const text = fs.readFileSync(skillMd, 'utf8');
	const fm = text.match(/^---\n([\s\S]*?)\n---/);
	if (!fm) {
		errors.push(`skills/${d.name}/SKILL.md has no YAML frontmatter — it will never register`);
		continue;
	}
	const name = fm[1].match(/^name:[ \t]*(.+)$/m)?.[1]?.trim();
	const description = fm[1].match(/^description:[ \t]*(.+)$/m)?.[1]?.trim();
	if (!name) errors.push(`skills/${d.name}/SKILL.md frontmatter has no name`);
	else if (name !== d.name) {
		errors.push(`skills/${d.name}/SKILL.md declares name "${name}", expected "${d.name}"`);
	}
	if (!description) errors.push(`skills/${d.name}/SKILL.md frontmatter has no description`);
}

// ----------------------------------------------------------- agent frontmatter

const agentsDir = path.join(OUT, 'agents');
if (fs.existsSync(agentsDir)) {
	for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
		const text = fs.readFileSync(path.join(agentsDir, f), 'utf8');
		if (!/^---\n[\s\S]*?\n---/.test(text)) {
			errors.push(`agents/${f} has no YAML frontmatter — it will never register`);
		}
	}
}

// ------------------------------------------------------- relative link integrity

for (const f of textFiles.filter((f) => f.rel.endsWith('.md'))) {
	const text = fs.readFileSync(f.full, 'utf8');
	const dir = path.dirname(f.full);
	for (const m of text.matchAll(/\]\((\.[^)\s#]+)/g)) {
		const target = path.resolve(dir, m[1]);
		if (!fs.existsSync(target)) {
			errors.push(`${f.rel}  broken relative link: ${m[1]}`);
		}
	}
}

// ------------------------------------------------------------ git-level checks
//
// Both of these are invisible in the working tree and only bite the person who
// installs the plugin: a script that lost its executable bit does not run, and a
// gitignored file is present here and absent everywhere else.
//
// Neither may fail on a legitimate upstream addition. A brand-new file is not in
// the index yet when this runs — CI verifies before it commits — so "not in the
// index" is never treated as an error on its own.

const inGitRepo = fs.existsSync(path.join(ROOT, '.git'));

if (inGitRepo) {
	// --- gitignored generated files. Asked directly, so a new upstream filename
	// that happens to be tracked-but-new does not read as a failure.
	const relPaths = files.map((f) => 'pstack/' + f.rel);
	try {
		const out = execFileSync('git', ['-C', ROOT, 'check-ignore', '--stdin'], {
			input: relPaths.join('\n'),
			encoding: 'utf8',
		});
		for (const line of out.split('\n').filter(Boolean)) {
			errors.push(`${line} is generated but gitignored — it would be missing for installers`);
		}
	} catch (e) {
		// check-ignore exits 1 when nothing matches, which is the good case.
		if (e.status !== 1) warnings.push(`git check-ignore failed: ${e.message}`);
	}

	// --- executable bits. chmod is a no-op on Windows, so the authority is the
	// mode git recorded, and UPSTREAM.json is what says which files need it.
	const modes = new Map();
	try {
		const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-s', '--', 'pstack'], {
			encoding: 'utf8',
		});
		for (const line of out.split('\n')) {
			const m = line.match(/^(\d{6}) \S+ \d+\t(.+)$/);
			if (m) modes.set(m[2].slice('pstack/'.length), m[1]);
		}
	} catch (e) {
		warnings.push(`could not read git modes: ${e.message}`);
	}

	let provenance;
	try {
		provenance = JSON.parse(fs.readFileSync(path.join(ROOT, 'UPSTREAM.json'), 'utf8'));
	} catch {
		errors.push('UPSTREAM.json is missing or unparseable — cannot check executable bits');
	}

	for (const rel of provenance?.port?.executable ?? []) {
		const mode = modes.get(rel);
		if (mode === undefined) {
			// Not staged yet. On Linux sync.mjs already chmodded it and `git add`
			// will record 100755; on Windows it will not, hence the warning.
			warnings.push(
				`pstack/${rel} is executable upstream but not yet in the index — ` +
					'stage it and re-run to confirm the mode',
			);
		} else if (mode !== '100755') {
			errors.push(
				`pstack/${rel} is mode ${mode}, expected 100755 — upstream ships it executable\n` +
					`      fix: git update-index --chmod=+x pstack/${rel}`,
			);
		}
	}
}

// ------------------------------------------------------------------- reporting

if (warnings.length) {
	console.log(`\n${warnings.length} warning(s):`);
	for (const w of warnings) console.log(`  ${w}`);
}

if (errors.length) {
	console.error(`\n${errors.length} error(s):`);
	for (const e of errors) console.error(`  ${e}`);
	console.error('\nverify failed — the port is not safe to publish');
	process.exit(1);
}

console.log(
	`\nverify passed — ${skillDirs.length} skills, ${textFiles.length} text files, ` +
		`${warnings.length} warning(s)`,
);
