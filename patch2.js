const fs = require('fs');

let content = fs.readFileSync('JS/hypothesis.js', 'utf8');

if (!content.includes('window.deleteHypothesisEntryById')) {
  const newFunc = `\nwindow.deleteHypothesisEntryById = function(entryId) {
  const wrapper = document.getElementById("hypothesis-wrapper");
  if (!wrapper) return;
  const entries = wrapper.querySelectorAll(".hypothesis-box");
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].dataset.hypothesisEntryId === String(entryId)) {
      wrapper.removeChild(entries[i]);
      if (typeof updateHypothesisNumbers === 'function') updateHypothesisNumbers(wrapper);
      if (typeof logHypothesisAction === 'function') logHypothesisAction("丮説: �Պ陔");
      if (typeof scheduleHypothesisSave === 'function') scheduleHypothesisSave();
      break;
    }
  }
};\n`;
  content += newFunc;
  fs.writeFileSync('JS/hypothesis.js', content, 'utf8');
  console.log('Added deleteHypothesisEntryById');
} else {
  console.log('deleteHypothesisEntryById already exists');
}
