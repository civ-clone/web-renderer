# web-renderer

## Commit messages are the release notes

Every commit message on `main` is shown to players as civ.one's release notes. `generate-changelog.mjs` (`toBullets`) keeps the subject only when there is no body. Otherwise it drops the subject, turns each body paragraph into a bullet, and drops trailers such as `Co-Authored-By:`.

So write each message for a player when you commit, not at release time. Once commits are on `main` they can't be reworded without rewriting history.

- **The body says what a player will notice,** one short paragraph per change, with issue references inline: "When choosing your civilization, you can now pick Random (#15)."
- **Never put `Closes #nn.` in a paragraph of its own.** It becomes a bullet on its own. Put it inside a sentence instead, "…stopped working (closes #46).", which still closes the issue.
- **Implementation detail** (root cause, internals, tests added) goes in the issue or PR, not the commit body.
- **Dev-only commits** (`chore:`, `test:`, `docs:`) can be a subject line alone. That subject then becomes the bullet, so keep it readable.
- **Check before pushing** by running the message through `toBullets`. Amend the latest commit if it reads badly.

## Releasing

`docs/build-and-release.md` has the full sequence. Pushing to `main` deploys to civ.one.
