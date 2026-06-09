const fs = require('fs');

let content = fs.readFileSync('JS/i18n.js', 'utf8');

content = content.replace(
  /deleteMindmapNodesHeader: .*,/gl,
  'deleteMindmapNodesHeader: "以下の {count} 件のノード（子ノードん含む）と、対応する丮説ミックスを削除します。','
[0];

content = content.replace(
  /deleteMindmapNodesHeader: "Delete \\{count\\} node+\\(s\\).*/gl,
  'deleteMindmapNodesHeader: "Delete {count} node(s) and their corresponding hypothesis boxes (including child nodes):",'
[1]);

fs.writeFileSync('JS/i18n.js', content, 'utf8');
console.log('Updated i18n messages');
