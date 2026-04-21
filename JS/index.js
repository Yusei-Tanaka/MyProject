const startSearchBtn = document.getElementById("startSearchBtn");
const usernameInput = document.getElementById("username");
const userPasswordInput = document.getElementById("userPassword");

var t = (key, vars = {}, fallback = "") => {
  if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
    return window.APP_I18N.t(key, vars, fallback);
  }
  return fallback || key;
};

const appConfig = window.APP_CONFIG || {};
const authApiBase = appConfig.apiBaseUrl || `http://${window.location.hostname || "127.0.0.1"}:${Number(appConfig.apiPort || 3000)}`;
const authenticateUser = async (id, password) => {
  const res = await fetch(`${authApiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error("ログイン失敗", body);
    return false;
  }
  return true;
};

const login = async () => {
  const id = usernameInput.value.trim();
  const password = userPasswordInput.value.trim();
  if (!id || !password) return alert(t("alerts.loginMissingCredentials", {}, "IDとパスワードを入力してください。"));

  const isAuthenticated = await authenticateUser(id, password);
  if (!isAuthenticated) {
    userPasswordInput.value = "";
    userPasswordInput.focus();
    alert(t("alerts.loginFailed", {}, "ログインに失敗しました。登録済みユーザのID/パスワードを確認してください。"));
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
