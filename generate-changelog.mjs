// Release notes for the in-app release window (`ReleaseWindow`), which bundles
// `changelog/releases.json` into `frontend.js` — so this runs *before* the
// build. See `docs/build-and-release.md` for where it sits in a release.
//
//   node generate-changelog.mjs <sha>     one entry, printed (what
//                                         generate-changelog.sh redirects)
//   node generate-changelog.mjs --release every commit after the newest entry
//                                         in releases.json: writes
//                                         changelog/<sha>.json for each and
//                                         puts them at the top of
//                                         releases.json, newest first
//
// A GitHub token is needed for external commit logs: `GITHUB_TOKEN`, or
// whatever `gh auth token` prints.

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { pathToFileURL } from 'url';

const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim(),
    gitOrNull = (...args) => {
        try {
            return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
        }
        catch (e) {
            return null;
        }
    };

// A commit message as bullets.
//
// Written one change per line — every commit before 2026 — each line is a
// bullet, as it always was. Written as a subject, a blank line and a body, the
// subject is dropped and the body becomes the bullets: one per paragraph, with
// hard-wrapped lines joined back up and `- ` items kept as their own. Trailers
// (`Co-Authored-By:` and the like) are not changes and are dropped. A message
// that is a subject and nothing else keeps its subject.
//
// A trailer is only a trailer below the first line: `release: …`, `docs: …` and
// every other conventional-commit subject matches `TRAILER` exactly as
// `Co-Authored-By: …` does, and dropping those left a body-less commit with
// nothing at all to show.
const TRAILER = /^[A-Za-z][\w-]*: \S/;

export const toBullets = (message) => {
    const paragraphs = message.replace(/\r/g, '').trim().split(/\n[ \t]*\n/)
        .map((paragraph) => paragraph.split('\n'))
        .filter((lines) => lines.some((line) => line.trim() !== ''));

    while (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].every((line) => TRAILER.test(line.trim()))) {
        paragraphs.pop();
    }

    if (paragraphs.length === 1) {
        const lines = paragraphs[0].map((line) => line.trim()).filter((line) => line !== '');

        return lines.filter((line, index) => index === 0 || !TRAILER.test(line));
    }

    const bullets = paragraphs.slice(1).flatMap((lines) => lines
        .reduce((items, line) => {
            const trimmed = line.trim();

            if (/^[-*] /.test(trimmed) || items.length === 0) {
                items.push(trimmed.replace(/^[-*] /, ''));
            }
            else {
                items[items.length - 1] += ' ' + trimmed;
            }

            return items;
        }, []));

    return bullets.length > 0 ? bullets : paragraphs[0].map((line) => line.trim());
};

// `@civ-clone` package → what the renderer resolved it to at a commit: a
// version, or a commit hash for a `github:` dependency. From `pnpm-lock.yaml`
// where there is one (b529bae onwards) and `yarn.lock` before that, so the
// commit that switched between them compares the two honestly.
const resolvedAt = (rev) => {
    const resolved = {},
        record = (name, ref) => {
            // Several versions can be installed at once. The newest is what a
            // release note means by "updated to".
            if (!(name in resolved) || compareRefs(ref, resolved[name]) > 0) {
                resolved[name] = ref;
            }
        },
        pnpm = gitOrNull('show', `${rev}:pnpm-lock.yaml`);

    if (pnpm !== null) {
        const packages = pnpm.slice(pnpm.indexOf('\npackages:'), pnpm.indexOf('\nsnapshots:') === -1 ? undefined : pnpm.indexOf('\nsnapshots:'));

        for (const [, name, spec] of packages.matchAll(/^  '@civ-clone\/([a-z\d-]+)@([^']+)':$/gim)) {
            const [, hash] = spec.match(/\b([0-9a-f]{40})\b/) || [];

            record(name, hash ? { hash } : { version: spec });
        }

        return resolved;
    }

    const yarn = gitOrNull('show', `${rev}:yarn.lock`) ?? '';

    for (const [, name, spec] of yarn.matchAll(/^\s+resolution: "@civ-clone\/([a-z\d-]+)@([^"]+)"$/gim)) {
        const [, hash] = spec.match(/commit=([0-9a-f]{40})/) || [],
            [, version] = spec.match(/^npm:(\d+\.\d+\.\d+)$/) || [];

        if (hash || version) {
            record(name, hash ? { hash } : { version });
        }
    }

    return resolved;
};

const compareRefs = (a, b) => {
    if (!a.version || !b.version) {
        return a.version ? -1 : 1;
    }

    const [x, y] = [a, b].map(({ version }) => version.split('.').map(Number));

    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

const sameRef = (a, b) => (a.hash ?? a.version) === (b.hash ?? b.version);

let githubToken = process.env.GITHUB_TOKEN ?? null;

const github = async (path) => {
    if (githubToken === null) {
        try {
            githubToken = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        }
        catch (e) {
            console.error('No GitHub token: set GITHUB_TOKEN, or log in with `gh auth login`.');
            process.exit(1);
        }
    }

    const response = await fetch(`https://api.github.com${path}`, {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
    });

    return response.ok ? response.json() : null;
};

// Memoised for the whole run: a `--release` over many commits asks for the same
// tags and ranges again and again.
const memo = new Map(),
    once = (key, produce) => {
        if (!memo.has(key)) {
            memo.set(key, produce());
        }

        return memo.get(key);
    };

// The commit a version was published from. `civ publish` tags `v0.1.21`; tags
// from before it are bare `0.1.2`, and a repo can have both, so try each. A
// version with no tag at all still reports as updated, with no log, rather
// than stopping the whole run as a missing tag used to.
const commitForRef = (repo, ref) => ref.hash
    ? Promise.resolve(ref.hash)
    : once(`tag:${repo}@${ref.version}`, async () => {
        for (const tag of [`v${ref.version}`, ref.version]) {
            const found = await github(`/repos/civ-clone/${repo}/git/refs/tags/${tag}`);

            if (!found) {
                continue;
            }

            if (found.object.type === 'commit') {
                return found.object.sha;
            }

            const annotated = await github(`/repos/civ-clone/${repo}/git/tags/${found.object.sha}`);

            if (annotated) {
                return annotated.object.sha;
            }
        }

        console.warn(`  no tag for civ-clone/${repo} ${ref.version}; recording it without a log`);

        return null;
    });

// Oldest first, as the window lists them. `compare` pages past its first 250
// commits; an added package has no base, so it gets its most recent hundred —
// the same cap the original used.
const externalLog = (repo, from, to) => once(`log:${repo}:${from}:${to}`, async () => {
    const messages = [];

    if (from === null) {
        const commits = (await github(`/repos/civ-clone/${repo}/commits?sha=${to}&per_page=100`)) ?? [];

        messages.push(...commits.reverse().map(({ commit }) => commit.message));
    }
    else {
        for (let page = 1; page <= 20; page++) {
            const compared = await github(`/repos/civ-clone/${repo}/compare/${from}...${to}?per_page=100&page=${page}`);

            if (!compared || compared.commits.length === 0) {
                break;
            }

            messages.push(...compared.commits.map(({ commit }) => commit.message));

            if (messages.length >= compared.total_commits) {
                break;
            }
        }
    }

    // `npm version patch` commits with the bare version as its message, so every
    // published package would otherwise list `0.1.5` among its changes.
    return messages.flatMap(toBullets).filter((bullet) => !/^v?\d+\.\d+\.\d+$/.test(bullet));
});

const externalChanges = async (sha) => {
    const lockfiles = ['pnpm-lock.yaml', 'yarn.lock'],
        changed = gitOrNull('diff', '--name-only', `${sha}^`, sha, '--', ...lockfiles);

    if (!changed || changed.trim() === '') {
        return {};
    }

    const before = resolvedAt(`${sha}^`),
        after = resolvedAt(sha),
        modules = {};

    for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
        const from = before[name] ?? null,
            to = after[name] ?? null;

        if (from && to && sameRef(from, to)) {
            continue;
        }

        if (!to) {
            modules[name] = { status: 'removed' };

            continue;
        }

        const toHash = await commitForRef(name, to),
            fromHash = from ? await commitForRef(name, from) : null;

        if (from && toHash && fromHash === toHash) {
            continue;
        }

        console.warn(`  ${name}: ${from ? (from.version ?? from.hash.slice(0, 7)) : '(new)'} → ${to.version ?? to.hash.slice(0, 7)}`);

        modules[name] = {
            status: from ? 'updated' : 'added',
            log: toHash ? await externalLog(name, fromHash, toHash) : [],
        };
    }

    return modules;
};

export const entryFor = async (rev) => {
    const hash = git('log', '--format=%h', '-n', '1', rev),
        { version } = JSON.parse(git('show', `${hash}:package.json`));

    return {
        version: `${version}@${hash}`,
        date: new Date(git('log', '--format=%aI', '-n', '1', hash)).toISOString(),
        localChanges: toBullets(git('log', '--format=%B', '-n', '1', hash)),
        externalChanges: await externalChanges(hash),
    };
};

// Newest entries at the top, existing bytes untouched below them. Rebuilding
// the file from `git log` — what generate-changelog-combined.sh did — cannot
// reproduce it: the last entry, `0.0.0`, was written by hand and exists nowhere
// else, and the shell loop also left a trailing comma for someone to remove.
const release = async () => {
    const target = 'changelog/releases.json',
        existing = readFileSync(target, 'utf8'),
        [newest] = JSON.parse(existing),
        since = newest.version.split('@')[1],
        commits = git('log', '--format=%h', `${since}..HEAD`).split('\n').filter(Boolean);

    if (commits.length === 0) {
        console.warn(`Nothing to add: ${newest.version} is already the newest entry.`);

        return;
    }

    console.warn(`${commits.length} commit(s) after ${since}.`);

    const entries = [];

    // Oldest first, so the memo fills in the order ranges build on each other.
    for (const hash of [...commits].reverse()) {
        const file = `changelog/${hash}.json`;

        console.warn(`${hash}...`);

        const entry = existsSync(file) && !process.argv.includes('--force')
            ? JSON.parse(readFileSync(file, 'utf8'))
            : await entryFor(hash);

        writeFileSync(file, JSON.stringify(entry));
        entries.unshift(entry);
    }

    const body = existing.replace(/^\[\n/, '');

    if (body === existing) {
        throw new Error(`${target} does not start with "[\\n"; refusing to guess where entries go.`);
    }

    const updated = '[\n' + entries.map((entry) => JSON.stringify(entry)).join('\n,\n') + '\n,\n' + body;

    JSON.parse(updated);
    writeFileSync(target, updated);

    console.warn(`${target}: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} added above ${newest.version}.`);
};

// Only when run, not when imported — a script importing `toBullets` should not
// generate an entry for whatever its own first argument happens to be. There is
// no `argv[1]` under `node -e`, or `node --import`, so guard that too.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (process.argv.includes('--release')) {
        await release();
    }
    else {
        const [, , targetCommit] = process.argv;

        console.log(JSON.stringify(await entryFor(targetCommit ?? 'HEAD')));
    }
}
