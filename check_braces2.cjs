const fs = require('fs');
const code = fs.readFileSync('src/ui.js', 'utf8');
let open = 0;
let inTemplate = false;
let inString = false;
let inChar = false;
let escape = false;

for (let i = 0; i < code.length; i++) {
  const c = code[i];
  if (escape) { escape = false; continue; }
  if (c === '\\') { escape = true; continue; }
  if (inTemplate) { if (c === '`') inTemplate = false; continue; }
  if (inString) { if (c === '"') inString = false; continue; }
  if (inChar) { if (c === "'") inChar = false; continue; }
  if (c === '`') inTemplate = true;
  else if (c === '"') inString = true;
  else if (c === "'") inChar = true;
  else if (c === '{') { open++; console.log(`Open brace at ${i}, line ~${code.slice(0, i).split('\n').length}: ${code.slice(Math.max(0, i-20), i+20)}`); }
  else if (c === '}') { open--; console.log(`Close brace at ${i}, line ~${code.slice(0, i).split('\n').length}: ${code.slice(Math.max(0, i-20), i+20)}`); }
  if (escape) { escape = false; continue; }
  if (c === '\\') { escape = true; continue; }
  if (inTemplate) { if (c === '`') inTemplate = false; continue; }
  if (inString) { if (c === '"') inString = false; continue; }
  if (inChar) { if (c === "'") inChar = false; continue; }
  if (c === '`') inTemplate = true;
  else if (c === '"') inString = true;
  else if (c === "'") inChar = true;
}

console.log('Final open braces:', open);