const startSearchBtn = document.getElementById("startSearchBtn");
const usernameInput = document.getElementById("username");
const userPasswordInput = document.getElementById("userPassword");

const saveXmlHost = window.location.hostname || "localhost";
const authApiPort = 3000;
const authenticateUser = async (id, password) => {
  const res = await fetch(`http://${saveXmlHost}:${authApiPort}/auth/login`, {
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
  if (!id || !password) return alert("IDとパスワードを入力してください。");

  const isAuthenticated = await authenticateUser(id, password);
  if (!isAuthenticated) {
    alert("ログインに失敗しました。登録済みユーザのID/パスワードを確認してください。");
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