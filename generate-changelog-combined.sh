# Superseded by `node generate-changelog.mjs --release` (`npm run release:changelog`).
#
# This used to rebuild changelog/releases.json from scratch, one `cat` per
# commit in `git log`. That can no longer reproduce the file: its last entry,
# `0.0.0`, was written by hand and exists nowhere else, so a rebuild would
# delete it — and the loop also left a trailing comma before `]` that had to be
# removed by hand. `--release` adds entries for commits newer than the newest
# one already there, at the top, and leaves every existing byte alone.

echo 'generate-changelog-combined.sh is superseded: run `npm run release:changelog`.' >&2;
exit 1;
