const startSearchBtn = document.getElementById("startSearchBtn");
const titleInput = document.getElementById("titleInput");
const themeHistoryContainer = document.getElementById("themeHistoryContainer");
const themeHistoryList = document.getElementById("themeHistoryList");
const deleteSelectedThemeBtn = document.getElementById("deleteSelectedThemeBtn");
const clearThemeHistoryBtn = document.getElementById("clearThemeHistoryBtn");

var t = (key, vars = {}, fallback = "") => {
  if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
    return window.APP_I18N.t(key, vars, fallback);
  }
  return fallback || key;
};

const appConfig = window.APP_CONFIG || {};
const fallbackHost = window.location.hostname || "127.0.0.1";
const authApiPort = Number(appConfig.apiPort || 3000);

const currentUser = (localStorage.getItem("userName") || "").trim();
if (!currentUser) {
  window.location.replace("index.html");
}

const normalizeThemeName = (value) => String(value || "").trim();

const resolveCurrentLanguage = () => {
  if (window.APP_I18N && typeof window.APP_I18N.getLanguage === "function") {
    const lang = window.APP_I18N.getLanguage();
    if (lang === "en" || lang === "ja") return lang;
  }
  const htmlLang = (document.documentElement.getAttribute("lang") || "").toLowerCase();
  return htmlLang.startsWith("en") ? "en" : "ja";
};

const normalizeThemeLanguage = (value) => {
  const lang = String(value || "").trim().toLowerCase();
  if (lang.startsWith("en")) return "en";
  if (lang.startsWith("ja")) return "ja";
  return "";
};

const inferThemeLanguageFromName = (themeName) => {
  const name = normalizeThemeName(themeName);
  if (!name) return resolveCurrentLanguage();

  // Hiragana, Katakana, Kanji, full-width ASCII, Japanese punctuation.
  const hasJapaneseChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff01-\uff60\u3000-\u303f]/.test(name);
  if (hasJapaneseChars) return "ja";

  const hasAsciiLetters = /[A-Za-z]/.test(name);
  if (hasAsciiLetters) return "en";

  return resolveCurrentLanguage();
};

const resolveThemeLanguage = (themeName, content) => {
  const contentObj = content && typeof content === "object" ? content : null;
  const fromContent = normalizeThemeLanguage(contentObj?.language || contentObj?.lang);
  if (fromContent) return fromContent;
  return inferThemeLanguageFromName(themeName);
};

const filterThemesByCurrentLanguage = (themes) => {
  const currentLanguage = resolveCurrentLanguage();
  return (Array.isArray(themes) ? themes : []).filter((entry) => {
    if (!entry || !entry.name) return false;
    return resolveThemeLanguage(entry.name, entry.content) === currentLanguage;
  });
};

const themeApiBase = appConfig.apiBaseUrl || `http://${fallbackHost}:${authApiPort}`;
let allThemes = [];
let cachedThemes = [];
let selectedThemeName = "";

const fetchThemeHistory = async (userName) => {
  const language = resolveCurrentLanguage();
  const res = await fetch(
    `${themeApiBase}/users/${encodeURIComponent(userName)}/themes?language=${encodeURIComponent(language)}`
  );
  if (!res.ok) {
    throw new Error(t("errors.themeHistoryFetchFailed", {}, "テーマ履歴の取得に失敗しました"));
  }

  const body = await res.json();
  if (!Array.isArray(body)) return [];

  return body
    .map((item) => ({
      name: normalizeThemeName(item.themeName),
      content: item.content && typeof item.content === "object" ? item.content : {},
      updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : 0,
    }))
    .filter((item, index, arr) => item.name && arr.findIndex((v) => v.name === item.name) === index)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

const refreshVisibleThemeHistory = () => {
  cachedThemes = filterThemesByCurrentLanguage(allThemes);
  return cachedThemes;
};

const saveTheme = async (userName, themeName) => {
  const themeLanguage = resolveCurrentLanguage();
  const res = await fetch(`${themeApiBase}/users/${encodeURIComponent(userName)}/themes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      themeName,
      language: themeLanguage,
      content: { themeName, language: themeLanguage },
    }),
  });
  if (!res.ok) {
    throw new Error(t("errors.themeSaveFailed", {}, "テーマの保存に失敗しました"));
  }
};

const removeTheme = async (userName, themeName) => {
  const language = resolveCurrentLanguage();
  const res = await fetch(
    `${themeApiBase}/users/${encodeURIComponent(userName)}/themes/${encodeURIComponent(themeName)}?language=${encodeURIComponent(language)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(t("errors.themeDeleteFailed", {}, "テーマ削除に失敗しました"));
  }
};

const clearThemes = async (userName) => {
  const language = resolveCurrentLanguage();
  const res = await fetch(`${themeApiBase}/users/${encodeURIComponent(userName)}/themes?language=${encodeURIComponent(language)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(t("errors.themeClearFailed", {}, "履歴削除に失敗しました"));
  }
};

const setSelectedTheme = (themeName) => {
  selectedThemeName = normalizeThemeName(themeName);
  const items = themeHistoryList.querySelectorAll(".theme-history-item");
  items.forEach((item) => {
    const isSelected = item.dataset.themeName === selectedThemeName;
    item.classList.toggle("is-selected", isSelected);
    item.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
};

const renderThemeHistory = (list) => {
  themeHistoryList.innerHTML = "";

  list.forEach((themeEntry) => {
    const itemButton = document.createElement("button");
    itemButton.type = "button";
    itemButton.className = "theme-history-item";
    itemButton.dataset.themeName = themeEntry.name;
    itemButton.setAttribute("role", "option");
    itemButton.setAttribute("aria-selected", "false");
    itemButton.textContent = `○ ${themeEntry.name}`;
    itemButton.addEventListener("click", () => {
      setSelectedTheme(themeEntry.name);
      titleInput.value = themeEntry.name;
    });
    themeHistoryList.appendChild(itemButton);
  });

  const hasHistory = list.length > 0;
  themeHistoryContainer.hidden = !hasHistory;
  deleteSelectedThemeBtn.disabled = !hasHistory;
  clearThemeHistoryBtn.disabled = !hasHistory;
};

const syncHistoryView = (nextTitle) => {
  refreshVisibleThemeHistory();
  renderThemeHistory(cachedThemes);

  if (nextTitle) {
    const matchedNext = cachedThemes.find((entry) => entry.name === nextTitle);
    if (matchedNext) {
      titleInput.value = nextTitle;
      setSelectedTheme(nextTitle);
      return;
    }
  }

  if (cachedThemes.length > 0) {
    titleInput.value = cachedThemes[0].name;
    setSelectedTheme(cachedThemes[0].name);
  } else {
    titleInput.value = "";
    setSelectedTheme("");
  }
};

const initialize = async () => {
  try {
    allThemes = await fetchThemeHistory(currentUser);
    refreshVisibleThemeHistory();
    renderThemeHistory(cachedThemes);
  } catch (error) {
    console.error(error);
    alert(t("alerts.themeHistoryLoadFailed", {}, "テーマ履歴の取得に失敗しました。サーバー状態を確認してください。"));
    allThemes = [];
    cachedThemes = [];
    renderThemeHistory(cachedThemes);
  }

  titleInput.value = "";
  setSelectedTheme("");
};

const startSearch = async () => {
  const title = titleInput.value.trim();
  if (!title) {
    alert(t("alerts.enterTitle", {}, "タイトルを入力してください。"));
    return;
  }

  try {
    await saveTheme(currentUser, title);
    allThemes = await fetchThemeHistory(currentUser);
    refreshVisibleThemeHistory();
  } catch (error) {
    console.error(error);
    alert(t("alerts.themeSaveFailedRetry", {}, "テーマ保存に失敗しました。時間をおいて再実行してください。"));
    return;
  }

  localStorage.setItem("searchTitle", title);
  window.location.href = "main.html?v=20260622-1";
};

const deleteSelectedTheme = async () => {
  const selectedTheme = normalizeThemeName(selectedThemeName || titleInput.value);
  if (!selectedTheme) {
    alert(t("alerts.selectThemeToDelete", {}, "削除するテーマを選択してください。"));
    return;
  }

  const ok = window.confirm(
    t("confirms.deleteTheme", { theme: selectedTheme }, `「${selectedTheme}」を削除します。よろしいですか？`)
  );
  if (!ok) return;

  try {
    await removeTheme(currentUser, selectedTheme);
    allThemes = await fetchThemeHistory(currentUser);
    refreshVisibleThemeHistory();
  } catch (error) {
    console.error(error);
    alert(t("alerts.themeDeleteFailed", {}, "テーマ削除に失敗しました。"));
    return;
  }

  if ((localStorage.getItem("searchTitle") || "").trim() === selectedTheme) {
    localStorage.removeItem("searchTitle");
  }

  syncHistoryView(cachedThemes[0]?.name || "");
};

const clearAllThemeHistory = async () => {
  const hasHistory = allThemes.length > 0;
  if (!hasHistory) return;

  const ok = window.confirm(t("confirms.clearThemeHistory", {}, "テーマ履歴をすべて削除します。よろしいですか？"));
  if (!ok) return;

  try {
    await clearThemes(currentUser);
    allThemes = [];
    cachedThemes = [];
  } catch (error) {
    console.error(error);
    alert(t("alerts.clearHistoryFailed", {}, "履歴全削除に失敗しました。"));
    return;
  }

  localStorage.removeItem("searchTitle");
  syncHistoryView("");
};

titleInput.addEventListener("input", () => {
  const currentInputTheme = normalizeThemeName(titleInput.value);
  const matched = cachedThemes.find((entry) => entry.name === currentInputTheme);
  setSelectedTheme(matched ? matched.name : "");
});

window.addEventListener("app-language-changed", () => {
  const previousSelected = selectedThemeName;
  syncHistoryView(previousSelected);
});

startSearchBtn.addEventListener("click", startSearch);
deleteSelectedThemeBtn.addEventListener("click", deleteSelectedTheme);
clearThemeHistoryBtn.addEventListener("click", clearAllThemeHistory);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startSearch();
});

initialize();
