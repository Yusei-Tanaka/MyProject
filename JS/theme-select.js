const startSearchBtn = document.getElementById("startSearchBtn");
const titleInput = document.getElementById("titleInput");
const themeHistoryContainer = document.getElementById("themeHistoryContainer");
const themeHistoryList = document.getElementById("themeHistoryList");
const deleteSelectedThemeBtn = document.getElementById("deleteSelectedThemeBtn");
const clearThemeHistoryBtn = document.getElementById("clearThemeHistoryBtn");

const apiHost = window.location.hostname || "localhost";
const authApiPort = 3000;
const saveXmlPort = 3005;

const currentUser = (localStorage.getItem("userName") || "").trim();
if (!currentUser) {
  window.location.replace("index.html");
}

const normalizeThemeName = (value) => String(value || "").trim();

const themeApiBase = `http://${apiHost}:${authApiPort}`;
const saveXmlBase = `http://${apiHost}:${saveXmlPort}`;
let cachedThemes = [];
let selectedThemeName = "";
const MAX_FILE_PART_LENGTH = 24;

const hashString8 = (value) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const sanitizeFilePart = (value) =>
  String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

const toShortFilePart = (value, fallback) => {
  const normalized = sanitizeFilePart(value) || fallback;
  if (normalized.length <= MAX_FILE_PART_LENGTH) {
    return normalized;
  }
  const headLength = MAX_FILE_PART_LENGTH - 9;
  const head = normalized.slice(0, headLength);
  return `${head}_${hashString8(normalized)}`;
};

const getThemeScopedXmlFilename = (userName, themeName) => {
  const safeUser = toShortFilePart(userName, "user");
  const safeTheme = toShortFilePart(themeName, "theme");
  return `${safeUser}__${safeTheme}.xml`;
};

const ensureThemeXmlExists = async (userName, themeName) => {
  const filename = getThemeScopedXmlFilename(userName, themeName);
  const existsRes = await fetch(
    `${saveXmlBase}/xml-exists?filename=${encodeURIComponent(filename)}`
  );
  if (!existsRes.ok) {
    throw new Error("XML存在確認に失敗しました");
  }

  const existsBody = await existsRes.json();
  if (existsBody.exists) return;

  const initialXml = `<?xml version="1.0" encoding="UTF-8"?>\n<?meta title="${themeName}"?>\n<ConceptMap><Nodes></Nodes><Edges></Edges></ConceptMap>`;
  const createRes = await fetch(`${saveXmlBase}/save-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, content: initialXml }),
  });
  if (!createRes.ok) {
    throw new Error("初期XMLの作成に失敗しました");
  }
};

const fetchThemeHistory = async (userName) => {
  const res = await fetch(`${themeApiBase}/users/${encodeURIComponent(userName)}/themes`);
  if (!res.ok) {
    throw new Error("テーマ履歴の取得に失敗しました");
  }

  const body = await res.json();
  if (!Array.isArray(body)) return [];

  return body
    .map((item) => ({
      name: normalizeThemeName(item.themeName),
      updatedAt: item.updatedAt ? new Date(item.updatedAt).getTime() : 0,
    }))
    .filter((item, index, arr) => item.name && arr.findIndex((v) => v.name === item.name) === index)
    .sort((a, b) => b.updatedAt - a.updatedAt);
};

const saveTheme = async (userName, themeName) => {
  const res = await fetch(`${themeApiBase}/users/${encodeURIComponent(userName)}/themes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      themeName,
      content: { themeName },
    }),
  });
  if (!res.ok) {
    throw new Error("テーマの保存に失敗しました");
  }
};

const removeTheme = async (userName, themeName) => {
  const res = await fetch(
    `${themeApiBase}/users/${encodeURIComponent(userName)}/themes/${encodeURIComponent(themeName)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error("テーマ削除に失敗しました");
  }
};

const clearThemes = async (userName) => {
  const res = await fetch(`${themeApiBase}/users/${encodeURIComponent(userName)}/themes`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error("履歴削除に失敗しました");
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
  renderThemeHistory(cachedThemes);

  if (nextTitle) {
    titleInput.value = nextTitle;
    setSelectedTheme(nextTitle);
    return;
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
    cachedThemes = await fetchThemeHistory(currentUser);
    renderThemeHistory(cachedThemes);
  } catch (error) {
    console.error(error);
    alert("テーマ履歴の取得に失敗しました。サーバー状態を確認してください。");
    cachedThemes = [];
    renderThemeHistory(cachedThemes);
  }

  titleInput.value = "";
  setSelectedTheme("");
};

const startSearch = async () => {
  const title = titleInput.value.trim();
  if (!title) {
    alert("タイトルを入力してください。");
    return;
  }

  try {
    await saveTheme(currentUser, title);
    await ensureThemeXmlExists(currentUser, title);
    cachedThemes = await fetchThemeHistory(currentUser);
  } catch (error) {
    console.error(error);
    alert("テーマ保存に失敗しました。時間をおいて再実行してください。");
    return;
  }

  localStorage.setItem("searchTitle", title);
  window.location.href = "main.html";
};

const deleteSelectedTheme = async () => {
  const selectedTheme = normalizeThemeName(selectedThemeName || titleInput.value);
  if (!selectedTheme) {
    alert("削除するテーマを選択してください。");
    return;
  }

  try {
    await removeTheme(currentUser, selectedTheme);
    cachedThemes = await fetchThemeHistory(currentUser);
  } catch (error) {
    console.error(error);
    alert("テーマ削除に失敗しました。");
    return;
  }

  if ((localStorage.getItem("searchTitle") || "").trim() === selectedTheme) {
    localStorage.removeItem("searchTitle");
  }

  syncHistoryView(cachedThemes[0]?.name || "");
};

const clearAllThemeHistory = async () => {
  const hasHistory = cachedThemes.length > 0;
  if (!hasHistory) return;

  const ok = window.confirm("テーマ履歴をすべて削除します。よろしいですか？");
  if (!ok) return;

  try {
    await clearThemes(currentUser);
    cachedThemes = [];
  } catch (error) {
    console.error(error);
    alert("履歴全削除に失敗しました。");
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

startSearchBtn.addEventListener("click", startSearch);
deleteSelectedThemeBtn.addEventListener("click", deleteSelectedTheme);
clearThemeHistoryBtn.addEventListener("click", clearAllThemeHistory);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startSearch();
});

initialize();
