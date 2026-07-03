const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
let depth = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') depth++;
  if (content[i] === '}') depth--;
}
console.log('Depth:', depth);
