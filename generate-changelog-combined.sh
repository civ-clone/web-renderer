target_file=changelog/releases.json;

echo '[' > $target_file;

for h in $(git log --format=%h); do
  cat changelog/$h.json >> $target_file;
   echo ',' >> $target_file;
done;

echo ']' >> $target_file;
