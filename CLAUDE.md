# web-renderer

## Commit messages are the release notes

Every commit message on `main` is shown to players as civ.one's release notes. `generate-changelog.mjs` (`toBullets`) keeps the subject only when there is no body. Otherwise it drops the subject, turns each body paragraph into a bullet, and drops trailers such as `Co-Authored-By:`. A squash merge works the same way: each squashed commit's `* type: subject` line is dropped where that commit has a body, and kept where it doesn't.

So write each message for a player when you commit, not at release time. Once commits are on `main` they can't be reworded without rewriting history.

- **The body says what a player will notice,** one short paragraph per change, with issue references inline: "When choosing your civilization, you can now pick Random (#15)."
- **Never put `Closes #nn.` in a paragraph of its own.** It becomes a bullet on its own. Put it inside a sentence instead, "…stopped working (closes #46).", which still closes the issue.
- **Implementation detail** (root cause, internals, tests added) goes in the issue or PR, not the commit body.
- **Dev-only commits** (`chore:`, `test:`, `docs:`) can be a subject line alone. That subject then becomes the bullet, so keep it readable.
- **Check before pushing** by running the message through `toBullets`. Amend the latest commit if it reads badly.

## Releasing

`docs/build-and-release.md` has the full sequence. Pushing to `main` deploys to civ.one, and the deploy build generates the release notes itself. There is no release commit. The next commit made on top of `main` carries the generated `changelog/` files: run `npm run release:changelog` on an up-to-date `main` and include them in that commit, usually the first commit of the next branch.

## Working practice

- **Work in a worktree,** never in the shared checkout, as several sessions work in this repository at once. To run
  `npm run release:changelog` on an up-to-date `main`, use a worktree on a detached `origin/main`.
- **Every change goes through a PR,** reviewed before it merges:
  - Copilot reviews each PR automatically. Also have a fresh agent, with none of your context, review the work.
  - High-severity findings, or anything particularly high-impact, need fixing and then another fresh review.
  - Medium findings are fixed before going on.
  - Low findings may be raised as issues instead.
  - Merging is blocked until every review thread is resolved.
- **Write as dom111.** You act as my account, so PRs, issues, comments and docs speak in the first person and don't
  refer to me in the third person.
- **Don't avoid bumping dependencies.** When a bump makes the work easier or better, weigh it against the cost of
  working round the old version, and remember that the library will probably need bumping eventually anyway.
- **Talk to the other sessions** working on web-renderer before releasing, so release notes aren't lost or doubled
  (see Releasing), and before running regression tests or other heavy CPU or GPU work, so the machine isn't overrun.
  - **Only those active in the last hour:** check `lastActivityAt` in the session list, or whether `ListAgents` shows
    the session busy. Activity that only answered your own message doesn't count.
  - **Don't message or wait on sessions that have been quiet for longer.**
- **Merge order:** the branch that merges next carries the notes `main` owes. Before merging, tell the recently active
  sessions your base SHA and wait for no objection; after merging, send them the merge SHA. Otherwise it's first
  ready, first merged.
- **Lockfile drag-ins:** `github:` dependencies and `pnpm update` pull in other sessions' newer engine commits. Read the
  lockfile diff for packages you didn't change, and either agree with their owner to take them, or pin them back by hand
  and check with `pnpm install --frozen-lockfile`. Keep one copy of each (`npm run civ -- duplicates`), and keep the
  root's ranges matching the workspace packages' peer ranges (`test:packages`).
- **Run the tests you need,** a targeted suite (`npm test -- --for <path>` or `npm run test:<name>`) rather than all
  ~230. Some suites (music, goToArrival, diplomats) are flaky under load, so rerun one alone before blaming a change.
