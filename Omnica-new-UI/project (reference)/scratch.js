const fs = require('fs');
const code = fs.readFileSync('/Users/fafo/Downloads/omnic-portal/project/app.jsx', 'utf-8');
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('admin') || line.includes('Admin')) {
    console.log(`Line ${i + 1}: ${line}`);
  }
});
