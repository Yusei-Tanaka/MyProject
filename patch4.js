const fs = require('fs');

let content = fs.readFileSync('JS/mindmap.js', 'utf8');

let index1 = content.indexOf('diagram.startTransaction("remove subtree")');
let index2 = content.indexOf('diagram.commitTransaction("remove subtree")', index1);

if (index1 !== -1 && index2 !== -1) {
  let target = content.substring(index1, index2);
  let replacement = target.replace(
    'diagram.removeParts(rootNode.findTreeParts(), false);',
    '\n      const entryIdsToDelete = [];\n      rootNode.findTreeParts().each(function(part) {\n        if (part instanceof go.Node && part.data && part.data.hypothesisEntryId) {\n          entryIdsToDelete.push(String(part.data.hypothesisEntryId));\n        }\n      });\n      if (entryIdsToDelete.length > 0 && typeof window.deleteHypothesisEntryById === \\'function\\') {\n        entryIdsToDelete.forEach(function(id) {\n          window.deleteHypothesisEntryById(id);\n        });\n      }\n\n      diagram.removeParts(rootNode.findTreeParts(), false);'
  );
  content = content.replace(target, replacement);
  fs.writeFileSync('JS/mindmap.js', content, 'utf8');
  console.log('Successfully patched JS/mindmap.js');
} else {
  console.log('Target not found in JS/mindmap.js');
}
