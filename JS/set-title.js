// localStorageからsearchTitleを取得してmyTitleにセット
window.addEventListener('DOMContentLoaded', function() {
  var searchTitle = localStorage.getItem('searchTitle');
  if (searchTitle) {
    var titleInput = document.getElementById('myTitle');
    if (titleInput) titleInput.value = searchTitle;
  }
});