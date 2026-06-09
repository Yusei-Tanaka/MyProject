const fs = require('fs');

let content = fs.readFileSync('JS/hypothesis.js', 'utf8');

const replacement = `  const onDeleteClick = function () {
    const entryId = entry.dataset.hypothesisEntryId;
    const confirmMsg = typeof t === 'function' ? t('confirms.deleteHypothesisNode', {}, '仮説と、対応する仮説構造化マップのノード（子ノード含む）を削除します。\\n本当によろしいですか？') : '仮説と、対応する仮説構造化マップのノード（子ノード含む）を削除します。\\n本当によろしいですか？';
    if (!confirm(confirmMsg)) return;

    if (entryId && typeof window.deleteMindmapNodeByEntryId === 'function') {
      window.deleteMindmapNodeByEntryId(entryId);
    }

    wrapper.removeChild(entry);
    updateHypothesisNumbers(wrapper);
    logHypothesisAction("仮説: 削除");
    scheduleHypothesisSave();
  };`;

const matchIndex = content.indexOf('const onDeleteClick = function');
if (matchIndex !== -1) {
  const endIndex = content.indexOf('};', matchIndex) + 2;
  const target = content.substring(matchIndex, endIndex);
  content = content.replace(target, replacement);
  fs.writeFileSync('JS/hypothesis.js', content, 'utf8');
  console.log('Successfully updated JS/hypothesis.js');
} else {
  console.log('Could not find onDeleteClick');
}
