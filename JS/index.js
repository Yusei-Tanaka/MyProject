const startSearchBtn = document.getElementById("startSearchBtn");
const titleInput = document.getElementById("titleInput");
const usernameInput = document.getElementById("username");

const saveXmlHost = window.location.hostname || "localhost";
const saveXmlPort = 3005;
const saveUserXml = async (name) => {
  const res = await fetch(`http://${saveXmlHost}:${saveXmlPort}/save-xml`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: `${name}.xml`,
      content: "<root></root>",
    }),
  });

  if (!res.ok) {
    console.error("保存に失敗しました");
    return false;
  }
  return true;
};

const startSearch = async () => {
  const title = titleInput.value.trim();
  if (!title) return alert("タイトルを入力してください。");

  const name = usernameInput.value.trim();
  if (!name) return alert("名前を入力してください。");

  localStorage.setItem("userName", name);

  const saved = await saveUserXml(name);
  if (!saved) return;

  localStorage.setItem("searchTitle", title);
  window.location.href = "main.html";
};

startSearchBtn.addEventListener("click", startSearch);
titleInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") startSearch();
});