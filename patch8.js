const fs = require('fs');

let content = fs.readFileSync('JS/hypothesis.js', 'utf8');
content = content.replace(/(window.deleteHypothesisEntryById =.*?if \(typeof logHypothesisAction === 'function'\) logHypothesisAction\()['"].*?['"]\)+/s, '$1logHypothesisAction("\\u4eee\\u8aac\\u003a\\u0020\\u524a\\u9664")');
fs.writeFileSync('JS/hypothesis.js', content, 'utf8');
console.log('Fixed encoding implicitly');
