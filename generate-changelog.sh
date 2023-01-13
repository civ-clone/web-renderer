SHA=$1;

echo "Processing $SHA...";
node generate-changelog.mjs $SHA > changelog/$(git log --format=%h -n 1 $SHA).json;
