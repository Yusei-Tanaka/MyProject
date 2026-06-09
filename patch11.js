const fs = require('fs');

let content = fs.readFileSync('JS/i18n.js', 'utf8');

content = content.replace(
  /deleteMindmapNodesHeader: "[^"]*"/
  ,'deleteMindmapNodesHeader: "\\u4ee5\\u4e8b\\u304e\\u0020 {count} \\u4ff6\\u304e\\u92ba\\u30fb\\u30db\\u30db\\uff0x\\u5be5\\u30d7\\u30fc\u30db\\u30db\\u3092\\u5425\\u30c4\\u3080\\uff09\\u30e8\\u3001\u5e1e\\u9adb\\u3093\\u304b\\u30db\\u30e4\\u30b9\\u4eee\\u8aac\\u30db\\u30cc\\u30c8\\u30b9\\u30e2\\u524a\\u9664\\u30c7\\u30ea\\u30b9\\u3002"'
);

content = content.replace(
  /deleteMindmapNodesHeader: "Delete \\{count\\} node+\\(s\\).*/,
  'deleteMindmapNodesHeader: "Delete {count} node(s) and their corresponding hypothesis boxes (including child nodes):",'
);

fs.writeFileSync('JS/i18n.js', content, 'utf8');
console.log('Updated i18n messages');
