const startSearchBtn = document.getElementById("startSearchBtn");
const usernameInput = document.getElementById("username");
const userPasswordInput = document.getElementById("userPassword");
const languageSelect = document.getElementById("languageSelect");

var t = (key, vars = {}, fallback = "") => {
  if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
    return window.APP_I18N.t(key, vars, fallback);
  }
  return fallback || key;
};

const appConfig = window.APP_CONFIG || {};
const authApiBase = appConfig.apiBaseUrl || `http://${window.location.hostname || "127.0.0.1"}:${Number(appConfig.apiPort || 3000)}`;

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timerId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timerId);
  }
};

const authenticateUser = async (id, password) => {
  let res;
  try {
    res = await fetchWithTimeout(
      `${authApiBase}/auth/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      },
      8000
    );
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.error("認証APIタイムアウト", err);
      return { ok: false, reason: "timeout" };
    }
    console.error("認証API接続失敗", err);
    return { ok: false, reason: "network" };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("ログイン失敗", res.status, body);
    if (res.status === 401) {
      return { ok: false, reason: "invalidCredentials" };
    }
    return { ok: false, reason: "server" };
  }

  return { ok: true };
};

const login = async () => {
  const id = usernameInput.value.trim();
  const password = userPasswordInput.value.trim();
  if (!id || !password) return alert(t("alerts.loginMissingCredentials", {}, "IDとパスワードを入力してください。"));

  if (window.APP_I18N && typeof window.APP_I18N.applyLanguage === "function") {
    const selectedLanguage = languageSelect && languageSelect.value ? languageSelect.value : "ja";
    window.APP_I18N.applyLanguage(selectedLanguage, true);
  }

  const authResult = await authenticateUser(id, password);
  if (!authResult.ok) {
    userPasswordInput.value = "";
    userPasswordInput.focus();

    if (authResult.reason === "timeout") {
      alert(t("alerts.authTimeout", {}, "認証サーバへの接続がタイムアウトしました。もう一度お試しください。"));
      return;
    }
    if (authResult.reason === "network") {
      alert(t("alerts.authServerUnavailable", {}, "認証サーバへ接続できません。サーバ起動状態を確認してください。"));
      return;
    }
    if (authResult.reason === "invalidCredentials") {
      alert(t("alerts.loginFailed", {}, "ログインに失敗しました。登録済みユーザのID/パスワードを確認してください。"));
      return;
    }

    alert(t("alerts.authFailed", {}, "認証に失敗しました。API接続を確認してください。"));
    return;
  }

  localStorage.setItem("userName", id);

  localStorage.removeItem("searchTitle");
  window.location.href = "theme-select.html";
};

startSearchBtn.addEventListener("click", login);
usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});
userPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});
