const Babel = require('@babel/standalone');
const fs = require('fs');
const code = fs.readFileSync('/Users/fafo/Downloads/omnic-portal/project/app.jsx', 'utf-8');
try {
  const result = Babel.transform(code, { presets: ['env', 'react'] });
  fs.writeFileSync('transpiled_app.js', result.code);
  const lines = result.code.split('\n');
  console.log('Line 66:', lines[65]);
  console.log('Line 67:', lines[66]);
  console.log('Line 68:', lines[67]);
} catch (e) {
  console.error(e);
}
