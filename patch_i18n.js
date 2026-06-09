const fs = require('fs');

let content = fs.readFileSync('JS/i18n.js', 'utf8');

content = content.replace(
  /deleteNodesFooter: "本当に削除してよろしいですか？"/,
  `deleteNodesFooter: "本当に削除してよろしいですか？",\n        deleteHypothesisNode: "仮説と、対応する仮説構造化マップのノード（子ノード含む）を削除します。\\n本当によろしいですか？"`
);

content = content.replace(
  /deleteNodesFooter: "Are you sure?"/,
  `deleteNodesFooter: "Are you sure?",\n        deleteHypothesisNode: "This will delete the hypothesis and its corresponding node (including child nodes) in the Hypothesis Structuring Map.\\nAre you sure?"`
);

fs.writeFileSync('JS/i18n.js', content, 'utf8');
console.log('Successfully updated JS/i18n.js');
