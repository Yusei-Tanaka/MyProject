const startSearchBtn = document.getElementById("startSearchBtn");
const titleInput = document.getElementById("titleInput");
const usernameInput = document.getElementById("username");
const userPasswordInput = document.getElementById("userPassword");

const saveXmlHost = window.location.hostname || "localhost";
const saveXmlPort = 3005;
const authApiPort = 3000;

const getUserXmlFilename = (id) => `${id}.xml`;

const ensureUserXmlExists = async (id) => {
  const filename = getUserXmlFilename(id);
  const existsRes = await fetch(
    `http://${saveXmlHost}:${saveXmlPort}/xml-exists?filename=${encodeURIComponent(filename)}`
  );
  if (!existsRes.ok) {
    console.error("XML存在確認に失敗しました");
    return false;
  }

  const existsBody = await existsRes.json();
  if (existsBody.exists) return true;

  const createRes = await fetch(`http://${saveXmlHost}:${saveXmlPort}/save-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename,
      content: "<?xml version=\"1.0\" encoding=\"UTF-8\"?><ConceptMap><Nodes></Nodes><Edges></Edges></ConceptMap>",
    }),
  });

  if (!createRes.ok) {
    console.error("初期XMLの作成に失敗しました");
    return false;
  }
  return true;
};
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

const startSearch = async () => {
  const title = titleInput.value.trim();
  if (!title) return alert("タイトルを入力してください。");

  const id = usernameInput.value.trim();
  const password = userPasswordInput.value.trim();
  if (!id || !password) return alert("IDとパスワードを入力してください。");

  const isAuthenticated = await authenticateUser(id, password);
  if (!isAuthenticated) {
    alert("ログインに失敗しました。登録済みユーザのID/パスワードを確認してください。");
    return;
  }

  localStorage.setItem("userName", id);

  const saved = await ensureUserXmlExists(id);
  if (!saved) return;

  localStorage.setItem("searchTitle", title);
  window.location.href = "main.html";
};

startSearchBtn.addEventListener("click", startSearch);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startSearch();
});