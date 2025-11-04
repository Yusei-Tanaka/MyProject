// テーマカテゴリが変更されたときの処理
document.getElementById('theme-category').addEventListener('change', function() {
  var theme = this.value;

  var careerCheckboxes = document.getElementById('career-checkboxes');
  var sdgsCheckboxes = document.getElementById('sdgs-checkboxes');
  var sdgscorporationCheckboxes = document.getElementById('sdgs-corporation-checkboxes');
  var regionCheckboxes = document.getElementById('region-checkboxes');
  var agricultureCheckboxes = document.getElementById('agriculture'); // ID名の間違いも修正
  var sportswelfereCheckboxes = document.getElementById('sports-welfere'); // ID名の間違いも修正

  // **すべてのチェックボックスを非表示にする**
  careerCheckboxes.style.display = 'none';
  sdgsCheckboxes.style.display = 'none';
  sdgscorporationCheckboxes.style.display = 'none';
  regionCheckboxes.style.display = 'none';
  agricultureCheckboxes.style.display = 'none';
  sportswelfereCheckboxes.style.display = 'none';

  // **カテゴリに応じて適切なチェックボックスを表示**
  if (theme === 'career') {
      careerCheckboxes.style.display = 'block';
  } else if (theme === 'sdgs') {
      sdgsCheckboxes.style.display = 'block';
  } else if (theme === 'sdgs-corporation') {
      sdgscorporationCheckboxes.style.display = 'block';
  } else if (theme === 'region') {
      regionCheckboxes.style.display = 'block';
  } else if (theme === 'agriculture') { // 修正
      agricultureCheckboxes.style.display = 'block';
  } else if (theme === 'sports-welfere') { // 修正
      sportswelfereCheckboxes.style.display = 'block';
  }
});
