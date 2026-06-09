const fs = require('fs');

let content = fs.readFileSync('JS/hypothesis.js', 'utf8');

let target = 'logHypothesisAction("丮説: 削除")';
let wrong = 'logHypothesisAction("丮説:］U陫")';
let replacement = 'logHypothesisActio("\\u4eee\\u8aac\\u003a\\u0020\\u524a\\u9664")';

if (content.indexOf(wrong) !== -1) {
  content = content.replace(wrong, replacement);
  fs.writeFileSync('JS/hypothesis.js', content, 'utf8');
  console.log('Fixed garbled text');
} else if (content.indexOf(target) !== -1) {
  content = content.replace(target, replacement);
  fs.writeFileSync('JS/hypothesis.js', content, 'utf8');
  console.log('Fixed target text');
} else {
  console.log('Nothing to fix');
}
