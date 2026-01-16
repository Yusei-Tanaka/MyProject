// localStorageからsearchTitleを取得してmyTitleにセット
window.addEventListener('DOMContentLoaded', function() {
  var searchTitle = localStorage.getItem('searchTitle');
  if (searchTitle) {
    var titleInput = document.getElementById('myTitle');
    if (titleInput) titleInput.value = searchTitle;
  }

  var storedName = localStorage.getItem('userName');
  var nameDisplay = document.getElementById('userNameDisplay');
  if (nameDisplay) {
    nameDisplay.textContent = storedName && storedName.trim() ? storedName : 'ゲスト';
  }
});