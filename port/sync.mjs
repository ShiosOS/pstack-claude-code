#!/usr/bin/env node
// Re-port pstack from cursor/plugins into ./pstack.
//
//   node port/sync.mjs                    # fetch upstream main, re-port
//   node port/sync.mjs --ref <sha|tag>    # pin a specific upstream commit
//   node port/sync.mjs --from <path>      # use an existing local clone
//   node port/sync.mjs --check            # exit 1 if the port would change
//
// The generated tree is deleted and rebuilt every run. Nothing hand-edited
// survives in ./pstack, which is deliberate: the only way to change the output
// is to change a rule or an overlay, so the port cannot quietly drift from what
// the rules say it should be.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { rewrites, structural } from './rules.mjs';

const UPSTREAM = 'https://github.com/cursor/plugins.git';
const SUBDIR = 'pstack';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, SUBDIR);
const OVERLAYS = path.join(ROOT, 'port', 'overlays');

const argv = process.argv.slice(2);
const arg = (flag) => {
	const i = argv.indexOf(flag);
	return i === -1 ? undefined : argv[i + 1];
};
const ref = arg('--ref') ?? 'main';
const localClone = arg('--from');
const checkOnly = argv.includes('--check');

// Text detection is by content, not by extension. Upstream ships executable
// scripts with no extension (skills/poteto-mode/scripts/watch-pr/watch-pr); an
// extension allowlist would silently skip them, so a `.cursor` path added there
// would survive the port untouched.
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

const git = (args, cwd) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// ---------------------------------------------------------------- fetch upstream

// Which upstream files are executable, read from the git index rather than from
// disk. A Windows checkout sets core.fileMode=false and writes every file 0644,
// so stat() would report upstream's scripts as non-executable and the port would
// ship them unrunnable. `git ls-files -s` reports the recorded mode, which is
// the same answer on every platform.
function executablesOf(repoRoot) {
	const out = new Set();
	for (const line of git(['ls-files', '-s', '--', SUBDIR], repoRoot).split('\n')) {
		const m = line.match(/^(\d{6}) \S+ \d+\t(.+)$/);
		if (m && m[1] === '100755') out.add(m[2].slice(SUBDIR.length + 1));
	}
	return out;
}

function fetchUpstream() {
	if (localClone) {
		const src = path.resolve(localClone);
		const sub = path.join(src, SUBDIR);
		if (!fs.existsSync(sub)) throw new Error(`--from ${src} has no ${SUBDIR}/ directory`);
		return {
			dir: sub,
			sha: git(['rev-parse', 'HEAD'], src),
			executables: executablesOf(src),
			cleanup: () => {},
		};
	}
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pstack-sync-'));
	console.log(`fetching ${UPSTREAM} @ ${ref}`);
	git(['init', '-q', '--initial-branch=main'], tmp);
	git(['remote', 'add', 'origin', UPSTREAM], tmp);
	git(['config', 'core.sparseCheckout', 'true'], tmp);
	fs.writeFileSync(path.join(tmp, '.git', 'info', 'sparse-checkout'), SUBDIR + '/*\n');
	git(['fetch', '--depth', '1', '--filter=blob:none', 'origin', ref], tmp);
	git(['checkout', '-q', 'FETCH_HEAD'], tmp);
	return {
		dir: path.join(tmp, SUBDIR),
		sha: git(['rev-parse', 'FETCH_HEAD'], tmp),
		executables: executablesOf(tmp),
		cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
	};
}

// ------------------------------------------------------------------- transform

const ruleHits = new Map();

// Relative paths upstream records as mode 100755. Set in main, before copyTree.
let executables = new Set();

function noteHit(name, relPath) {
	const entry = ruleHits.get(name) ?? new Set();
	entry.add(relPath);
	ruleHits.set(name, entry);
}

function transform(relPath, text) {
	let out = text;
	for (const rule of rewrites) {
		const before = out;
		out = out.replace(rule.find, rule.replace);
		if (out !== before) noteHit(rule.name, relPath);
	}
	for (const s of structural) {
		const before = out;
		out = s.apply(relPath, out);
		if (out !== before) noteHit(s.name, relPath);
	}
	return out;
}

function copyTree(srcDir, destDir, relBase = '') {
	const stats = { files: 0, transformed: 0 };
	for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
		// Cursor's own plugin manifest is replaced by a generated .claude-plugin.
		if (entry.name === '.cursor-plugin' || entry.name === '.git') continue;
		const rel = relBase ? relBase + '/' + entry.name : entry.name;
		const src = path.join(srcDir, entry.name);
		const dest = path.join(destDir, entry.name);
		if (entry.isDirectory()) {
			fs.mkdirSync(dest, { recursive: true });
			const sub = copyTree(src, dest, rel);
			stats.files += sub.files;
			stats.transformed += sub.transformed;
			continue;
		}
		stats.files++;
		if (isText(src)) {
			const original = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
			const ported = transform(rel, original);
			if (ported !== original) stats.transformed++;
			fs.writeFileSync(dest, ported, 'utf8');
		} else {
			fs.copyFileSync(src, dest);
		}
		// Upstream ships runnable scripts. chmod is a no-op on Windows, so the
		// mode is also recorded in UPSTREAM.json and asserted by verify.mjs
		// against the git index, which is where it actually has to be right.
		if (executables.has(rel)) fs.chmodSync(dest, 0o755);
	}
	return stats;
}

// -------------------------------------------------------------------- overlays

function parseOverlay(file) {
	const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!m) throw new Error(`overlay ${path.basename(file)} has no frontmatter block`);
	const meta = {};
	for (const line of m[1].split('\n')) {
		const kv = line.match(/^([a-z]+):\s*(.*)$/);
		if (kv) meta[kv[1]] = kv[2].trim();
	}
	return {
		name: path.basename(file, '.md'),
		targets: (meta.target ?? '').split(',').map((t) => t.trim()).filter(Boolean),
		enabled: meta.enabled !== 'false',
		body: m[2].trim(),
	};
}

function applyOverlays() {
	const applied = [];
	const files = fs.existsSync(OVERLAYS)
		? fs.readdirSync(OVERLAYS).filter((f) => f.endsWith('.md') && f !== 'README.md').sort()
		: [];
	for (const f of files) {
		const o = parseOverlay(path.join(OVERLAYS, f));
		if (!o.enabled) {
			console.log(`  overlay ${o.name}: disabled`);
			continue;
		}
		if (!o.targets.length) throw new Error(`overlay ${o.name} declares no target`);
		for (const target of o.targets) {
			const dest = path.join(OUT, target);
			if (!fs.existsSync(dest)) {
				throw new Error(
					`overlay ${o.name} targets ${target}, which upstream no longer provides. ` +
						'Retarget it or set enabled: false.',
				);
			}
			const current = fs.readFileSync(dest, 'utf8').replace(/\s+$/, '');
			const marker = `<!-- pstack-claude-code overlay: ${o.name} -->`;
			fs.writeFileSync(dest, `${current}\n\n${marker}\n${o.body}\n`, 'utf8');
			applied.push(`${o.name} -> ${target}`);
		}
	}
	return applied;
}

// -------------------------------------------------------------------- manifest

function writeManifest(srcDir) {
	const cursorManifest = JSON.parse(
		fs.readFileSync(path.join(srcDir, '.cursor-plugin', 'plugin.json'), 'utf8'),
	);
	// Claude Code discovers skills/ and agents/ by convention, so the Cursor-only
	// routing keys (skills, agents, category, tags, displayName) are dropped
	// rather than mapped.
	const manifest = {
		name: 'pstack',
		version: cursorManifest.version,
		description: cursorManifest.description,
		author: cursorManifest.author,
		homepage: 'https://github.com/cursor/plugins/tree/main/pstack',
		repository: 'https://github.com/cursor/plugins',
		license: cursorManifest.license,
		keywords: cursorManifest.keywords,
	};
	const dir = path.join(OUT, '.claude-plugin');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, 'plugin.json'),
		JSON.stringify(manifest, null, '\t') + '\n',
		'utf8',
	);
	return manifest;
}

// ------------------------------------------------------------------------ main

const upstream = fetchUpstream();
try {
	fs.rmSync(OUT, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
	fs.mkdirSync(OUT, { recursive: true });

	executables = upstream.executables;
	const stats = copyTree(upstream.dir, OUT);
	const manifest = writeManifest(upstream.dir);
	const overlaysApplied = applyOverlays();

	const skills = fs
		.readdirSync(path.join(OUT, 'skills'), { withFileTypes: true })
		.filter((d) => d.isDirectory()).length;
	const agents = fs.existsSync(path.join(OUT, 'agents'))
		? fs.readdirSync(path.join(OUT, 'agents')).filter((f) => f.endsWith('.md')).length
		: 0;

	const provenance = {
		upstream: { repo: UPSTREAM, subdir: SUBDIR, ref, commit: upstream.sha },
		plugin: { name: manifest.name, version: manifest.version },
		port: {
			skills,
			agents,
			files: stats.files,
			filesTransformed: stats.transformed,
			executable: [...executables].sort(),
			rulesApplied: Object.fromEntries(
				[...ruleHits.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, v.size]),
			),
			overlays: overlaysApplied,
		},
	};
	fs.writeFileSync(
		path.join(ROOT, 'UPSTREAM.json'),
		JSON.stringify(provenance, null, '\t') + '\n',
		'utf8',
	);

	console.log(
		`\nported ${stats.files} files (${stats.transformed} rewritten) — ` +
			`${skills} skills, ${agents} agents, pstack v${manifest.version} @ ${upstream.sha.slice(0, 7)}`,
	);
	for (const [rule, files] of [...ruleHits.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		console.log(`  ${rule}: ${files.size} file(s)`);
	}
	for (const o of overlaysApplied) console.log(`  overlay ${o}`);

	const unused = [...rewrites.map((r) => r.name), ...structural.map((s) => s.name)].filter(
		(n) => !ruleHits.has(n),
	);
	if (unused.length) console.log(`\nrules that matched nothing: ${unused.join(', ')}`);

	if (checkOnly) {
		const dirty = execFileSync(
			'git',
			['-C', ROOT, 'status', '--porcelain', '--', SUBDIR, 'UPSTREAM.json'],
			{ encoding: 'utf8' },
		).trim();
		if (dirty) {
			console.error(`\n--check: port is out of date\n${dirty}`);
			process.exit(1);
		}
		console.log('\n--check: port is current');
	}
} finally {
	upstream.cleanup();
}
