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
  else if (c === '{') open++;
  else if (c === '}') open--;
}

console.log('Open braces:', open);
console.log('In template:', inTemplate);
console.log('In string:', inString);
console.log('In char:', inChar);