const API_BASE = "http://127.0.0.1:3000";

const userIdInput = document.getElementById("userId");
const passwordInput = document.getElementById("password");
const createBtn = document.getElementById("createBtn");
const updateUserIdInput = document.getElementById("updateUserId");
const updatePasswordInput = document.getElementById("updatePassword");
const updateBtn = document.getElementById("updateBtn");
const reloadBtn = document.getElementById("reloadBtn");
const userTableBody = document.getElementById("userTableBody");
const userCount = document.getElementById("userCount");
const statusArea = document.getElementById("status");
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

const validateInputs = (id, password) => {
  if (!USER_ID_PATTERN.test(id)) {
    return "ユーザIDは3〜32文字、英数字・_・-のみ使えます";
  }
  if (password.length === 0) {
    return "パスワードを入力してください";
  }
  return "";
};

const setStatus = (message, isError = false) => {
  statusArea.textContent = message;
  statusArea.setAttribute("data-error", isError ? "1" : "0");
};

const renderEmptyRow = (message) => {
  userTableBody.innerHTML = "";
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.colSpan = 2;
  td.textContent = message;
  tr.appendChild(td);
  userTableBody.appendChild(tr);
  userCount.textContent = "0件";
};

const loadUsers = async () => {
  try {
    const res = await fetch(`${API_BASE}/users`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const users = await res.json();
    userTableBody.innerHTML = "";

    if (!Array.isArray(users) || users.length === 0) {
      renderEmptyRow("ユーザがまだ登録されていません");
      return;
    }

    userCount.textContent = `${users.length}件`;

    users.forEach((user) => {
      const tr = document.createElement("tr");

      const userTd = document.createElement("td");
      const label = document.createElement("span");
      label.textContent = user.id;
      userTd.appendChild(label);

      const actionTd = document.createElement("td");

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "削除";
      deleteBtn.addEventListener("click", async () => {
        try {
          const res = await fetch(`${API_BASE}/users/${encodeURIComponent(user.id)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP ${res.status}`);
          }
          setStatus(`ユーザ ${user.id} を削除しました`);
          await loadUsers();
        } catch (error) {
          console.error(error);
          setStatus(`削除に失敗しました: ${error.message}`, true);
        }
      });

      actionTd.appendChild(deleteBtn);
      tr.appendChild(userTd);
      tr.appendChild(actionTd);
      userTableBody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    setStatus("ユーザ一覧の取得に失敗しました", true);
    renderEmptyRow("ユーザ一覧の取得に失敗しました");
  }
};

const createUser = async () => {
  const id = userIdInput.value.trim();
  const passwordHash = passwordInput.value.trim();

  if (!id || !passwordHash) {
    setStatus("ユーザIDとパスワードを入力してください", true);
    return;
  }
  const createValidationError = validateInputs(id, passwordHash);
  if (createValidationError) {
    setStatus(createValidationError, true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, passwordHash }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    setStatus(`ユーザ ${id} を登録しました`);
    passwordInput.value = "";
    await loadUsers();
  } catch (error) {
    console.error(error);
    setStatus(`登録に失敗しました: ${error.message}`, true);
  }
};

const updateUserPassword = async () => {
  const id = updateUserIdInput.value.trim();
  const passwordHash = updatePasswordInput.value.trim();

  if (!id || !passwordHash) {
    setStatus("更新対象IDと新しいパスワードを入力してください", true);
    return;
  }
  const updateValidationError = validateInputs(id, passwordHash);
  if (updateValidationError) {
    setStatus(updateValidationError, true);
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/users/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordHash }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    setStatus(`ユーザ ${id} のパスワードを更新しました`);
    updatePasswordInput.value = "";
  } catch (error) {
    console.error(error);
    setStatus(`更新に失敗しました: ${error.message}`, true);
  }
};

createBtn.addEventListener("click", createUser);
updateBtn.addEventListener("click", updateUserPassword);
reloadBtn.addEventListener("click", loadUsers);

setStatus("準備完了", false);
loadUsers();
