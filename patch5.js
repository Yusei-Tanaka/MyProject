const fs = require('fs');

let content = fs.readFileSync('JS/mindmap.js', 'utf8');

const t1 = 'diagram.removeParts(rootNode.findTreeParts(), false);';
const r1 = 'const entryIdsToDelete = []; rootNode.findTreeParts().each(function(part) { if (part instanceof go.Node && part.data && part.data.hypothesisEntryId) { entryIdsToDelete.push(String(part.data.hypothesisEntryId)); } }); if (entryIdsToDelete.length > 0 && typeof window.deleteHypothesisEntryById === \\'function\\') { entryIdsToDelete.forEach(function(id) { window.deleteHypothesisEntryById(id); }); } diagram.removeParts(rootNode.findTreeParts(), false);';

if (content.includes(t1)) {
  content = content.replace(t1, r1);
  fs.writeFileSync('JS/mindmap.js', content, 'utf8');
  console.log('Patched JS/mindmap.js');
} else {
  console.log('Target not found in JS/mindmap.js');
}
