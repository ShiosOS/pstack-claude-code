#!/usr/bin/env node
// Gate the generated port. Exits non-zero on anything that would ship broken.
//
//   node port/verify.mjs
//
// This is the piece that makes an automated mirror safe. sync.mjs applies the
// rules it knows; verify.mjs asserts that nothing Cursor-specific survived and
// that the result is a well-formed Claude Code plugin. When upstream introduces
// a Cursor-ism no rule covers, this fails and CI refuses to publish, instead of
// shipping instructions that point at paths which do not exist here.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'pstack');

const errors = [];
const warnings = [];

// Occurrences that are correct as-is. Each entry needs a reason, because an
// allowlist without reasons becomes a place to hide real failures.
const ALLOW = [
	{
		pattern: /cursor\/plugins/,
		why: 'upstream repo URL — correct to reference in provenance and attribution',
	},
	{
		pattern: /cursor\.com\/(?:agents|docs|dashboard)/,
		why: 'orchestrate playbook documents Cursor cloud, which has no Claude Code equivalent',
	},
	{ pattern: /CURSOR_API_KEY/, why: 'same — Cursor cloud credential, documented not used' },
	{ pattern: /`?Agent\.create`?/, why: 'Cursor cloud SDK call named in the orchestrate playbook' },
	{ pattern: /cursor-team-kit/, why: 'sibling Cursor plugin referenced by name only' },
];

const allowed = (line) => ALLOW.some((a) => a.pattern.test(line));

// Tokens that must not survive the port.
const FORBIDDEN = [
	{ name: 'cursor-dotdir', pattern: /\.cursor[\/\\]/, hint: 'add a path rule in rules.mjs' },
	{ name: 'cursor-transcripts', pattern: /agent-transcripts/, hint: 'transcript layout differs in Claude Code' },
	{ name: 'cursor-rule-frontmatter', pattern: /^alwaysApply:/m, hint: 'Cursor-only frontmatter key' },
	{ name: 'cursor-mdc-file', pattern: /\.mdc\b/, hint: 'Cursor rule extension; Claude Code uses .md' },
	{ name: 'ask-question-tool', pattern: /\bAskQuestion\b/, hint: 'Claude Code tool is AskUserQuestion' },
	{ name: 'task-tool', pattern: /\bTask (?:tool|subagent)\b/, hint: 'Claude Code tool is Agent' },
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

const files = walk(OUT);
const textFiles = files.filter((f) =>
	/\.(md|txt|json|sh|mjs|js|ts|ya?ml)$/i.test(f.rel) || path.basename(f.rel) === 'LICENSE',
);

// ------------------------------------------------------------ forbidden tokens

for (const f of textFiles) {
	const lines = fs.readFileSync(f.full, 'utf8').split('\n');
	lines.forEach((line, i) => {
		for (const rule of FORBIDDEN) {
			if (!rule.pattern.test(line)) continue;
			if (allowed(line)) continue;
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
		if (allowed(line)) return;
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
