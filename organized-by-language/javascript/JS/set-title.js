// localStorageからsearchTitleを取得してmyTitleにセット
window.addEventListener('DOMContentLoaded', function() {
  var t = function(key, vars, fallback) {
    if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
      return window.APP_I18N.t(key, vars || {}, fallback || "");
    }
    return fallback || key;
  };

  var searchTitle = localStorage.getItem('searchTitle');
  if (searchTitle) {
    var titleInput = document.getElementById('myTitle');
    if (titleInput) titleInput.value = searchTitle;
  }

  var storedName = localStorage.getItem('userName');
  var nameDisplay = document.getElementById('userNameDisplay');
  if (nameDisplay) {
    nameDisplay.textContent = storedName && storedName.trim() ? storedName : t("common.guest", {}, "ゲスト");
  }
});