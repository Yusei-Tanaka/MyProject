const fs = require('fs');

let content = fs.readFileSync('JS/i18n.js', 'utf8');

let jpText = Buffer.from('5Lul5LiL44GuIHtcoVV1dH0g5Lu244Gu44OO44O844OJ77yI5a2044OO44O844OJ44KS5ZCr44KA77rJ44Go44CB5a++5b+c44GZ44KL5Liu6Kqs44Oc44OD44Kv44K544KS5YmK6Zmk$4GX44G+44GZ44CC', 'base64').toString('utf8');
let enText = 'Delete {count} node(s) and corresponding hypothesis boxes (including child nodes):';

let matches = 0;
content = content.replace(/deleteMindmapNodesHeader:\s*\"[^\"]*\"/g, function() {
  matches++;
  if (matches === 1) return 'deleteMindmapNodesHeader: "' + jpText + '"';
  else return 'deleteMindmapNodesHeader: "' + enText + '"';
});

fs.writeFileSync('JS/i18n.js', content, 'utf8');
console.log('Done');
