const fs = require('fs');
const glob = require('glob');
glob.sync('*.jsx').forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  const lines = code.split('\n');
  lines.forEach((l, i) => {
    if (l.match(/\bAdmin\b/)) {
      console.log(`${file}:${i+1}: ${l}`);
    }
  });
});
