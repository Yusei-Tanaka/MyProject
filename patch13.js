const fs = require('fs');

let content = fs.readFileSync('JS/i18n.js', 'utf8');

let jpText = '\\u4ee5\\u4e0b\\u306e\\u0020\\u007b\\u0063\\u006d\\u0075\\u006e\\u0074\\u007d\\u0020\\u4ef6\\u306e\\u30ce\\u30fc\\u30c4\\uff08\\u5b50\\u30ce\\u30fc\\u30c4\\u3092\\u542b\\u3080\\uff09\\u3068\\u3001\\u5bfe\\u5fdc\\u3059\\u308b\\u4eee\\u8aac\\u30db\\u30cc\\u30c8\\u30b9\\u3092\\u524a\\u9664\\u3057\\u304f\\u3059\\u3002';
let enText = 'Delete {count} node(s) and corresponding hypothesis boxes (including child nodes):';

let matches = 0;
content = content.replace(/deleteMindmapNodesHeader:\s*\"[^\"]*\"/g, function() {
  matches++;
  if (matches === 1) return 'deleteMindmapNodesHeader: "' + jpText + '"';
  else return 'deleteMindmapNodesHeader: "' + enText + '"';
});

fs.writeFileSync('JS/i18n.js', content, 'utf8');
console.log('Done');
