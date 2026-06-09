const fs = require('fs');

let content = fs.readFileSync('JS/mindmap.js', 'utf8');

const target = `    diagram.startTransaction("remove subtree");\n    rootNodes.forEach(function(rootNode) {\n      const removedKey = rootNode.data && rootNode.data.key !== undefined ? rootNode.data.key : "";\n      const removedText = getMindmapNodeText(rootNode);\n      diagram.removeParts(rootNode.findTreeParts(), false);\n      logMindmapAction(`マインドマップ: ノード削除 source=${source} key=${removedKey} "${removedText}"`);\n    });`;

const replacement = `    diagram.startTransaction("remove subtree");\n    rootNodes.forEach(function(rootNode) {\n      const removedKey = rootNode.data && rootNode.data.key !== undefined ? rootNode.data.key : "";\n      const removedText = getMindmapNodeText(rootNode);\n\n      const entryIdsToDelete = [];\n      rootNode.findTreeParts().each(function(part) {\n        if (part instanceof go.Node && part.data && part.data.hypothesisEntryId) {\n          entryIdsToDelete.push(String(part.data.hypothesisEntryId));\n        }\n      });\n      if (entryIdsToDelete.length > 0 && typeof window.deleteHypothesisEntryById === 'function') {\n        entryIdsToDelete.forEach(function(id) {\n          window.deleteHypothesisEntryById(id);\n        });\n      }\n\n      diagram.removeParts(rootNode.findTreeParts(), false);\n      logMindmapAction(`マインドマップ: ノード削除 source=${source} key=${removedKey} "${removedText}"`);\n    });`;

let targetLf = target.replace(/\\r\\n/g, '\\n');
let targetCrLf = target.replace(/\\n/g, '\\r\\n');

if (content.indexOf(target) !== -1) {
  content = content.replace(target, replacement);
  fs.writeFileSync('JS/mindmap.js', content, 'utf8');
  console.log('Successfully updated JS/mindmap.js (Exact)');
} else if (content.indexOf(targetLf) !== -1) {
  content = content.replace(targetLf, replacement);
  fs.writeFileSync('JS/mindmap.js', content, 'utf8');
  console.log('Successfully updated JS/mindmap.js (LF)');
} else if (content.indexOf(targetCrLf) !== -1) {
  content = content.replace(targetCrLf, replacement);
  fs.writeFileSync('JS/mindmap.js', content, 'utf8');
  console.log('Successfully updated JS/mindmap.js (CRLF)');
} else {
  console.log('Target string not found in JS/mindmap.js');
}
