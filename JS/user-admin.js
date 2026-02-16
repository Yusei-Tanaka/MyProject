const userAdminHost = window.location.hostname || "127.0.0.1";
const userAdminApiPort = 3000;
const userAdminBaseUrl = `http://${userAdminHost}:${userAdminApiPort}`;
const USER_ADMIN_ACCESS_PASSWORD = "kslabkslab";
const normalizeAdminPasswordInput = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

const userAdminAuthPage = document.getElementById("userAdminAuthPage");
const userAdminProtectedPage = document.getElementById("userAdminProtectedPage");
const userAdminLoginForm = document.getElementById("userAdminLoginForm");
const adminPasswordInput = document.getElementById("adminPassword");
const userAdminAuthMessage = document.getElementById("userAdminAuthMessage");

const userCreateForm = document.getElementById("userCreateForm");
const passwordUpdateForm = document.getElementById("passwordUpdateForm");
const newUserIdInput = document.getElementById("newUserId");
const newUserPasswordInput = document.getElementById("newUserPassword");
const passwordTargetUserIdInput = document.getElementById("passwordTargetUserId");
const currentPasswordInput = document.getElementById("currentPassword");
const updatedPasswordInput = document.getElementById("updatedPassword");
const refreshUsersBtn = document.getElementById("refreshUsersBtn");
const userList = document.getElementById("userList");
const userAdminMessage = document.getElementById("userAdminMessage");

const setAuthMessage = (message, isError = false) => {
  if (!userAdminAuthMessage) return;
  userAdminAuthMessage.textContent = message;
  userAdminAuthMessage.classList.toggle("is-error", Boolean(isError));
};

const setMessage = (message, isError = false) => {
  if (!userAdminMessage) return;
  userAdminMessage.textContent = message;
  userAdminMessage.classList.toggle("is-error", Boolean(isError));
};

const renderUsers = (users) => {
  if (!userList) return;
  userList.innerHTML = "";
  if (!Array.isArray(users) || users.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "ユーザが登録されていません。";
    userList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    const item = document.createElement("li");
    item.textContent = user.id;
    userList.appendChild(item);
  });
};

const fetchUsers = async () => {
  setMessage("ユーザ一覧を取得中...");
  try {
    const response = await fetch(`${userAdminBaseUrl}/users`);
    const body = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(body.error || "ユーザ一覧の取得に失敗しました。");
    }

    renderUsers(body);
    setMessage(`ユーザ一覧を更新しました（${body.length}件）。`);
  } catch (error) {
    renderUsers([]);
    setMessage(error.message || "ユーザ一覧の取得に失敗しました。", true);
  }
};

const createUser = async (event) => {
  event.preventDefault();

  const id = newUserIdInput.value.trim();
  const passwordHash = newUserPasswordInput.value.trim();
  if (!id || !passwordHash) {
    setMessage("ユーザIDとパスワードを入力してください。", true);
    return;
  }

  setMessage("ユーザを登録中...");

  try {
    const response = await fetch(`${userAdminBaseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, passwordHash }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "ユーザ登録に失敗しました。");
    }

    setMessage(`ユーザ「${body.id}」を登録しました。`);
    newUserPasswordInput.value = "";
    await fetchUsers();
  } catch (error) {
    setMessage(error.message || "ユーザ登録に失敗しました。", true);
  }
};

const updatePassword = async (event) => {
  event.preventDefault();

  const id = passwordTargetUserIdInput.value.trim();
  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = updatedPasswordInput.value.trim();
  if (!id || !currentPassword || !newPassword) {
    setMessage("変更対象ユーザID・現在のパスワード・新しいパスワードを入力してください。", true);
    return;
  }

  setMessage("パスワードを変更中...");

  try {
    const response = await fetch(`${userAdminBaseUrl}/users/${encodeURIComponent(id)}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "パスワード変更に失敗しました。");
    }

    setMessage(`ユーザ「${id}」のパスワードを変更しました。`);
    currentPasswordInput.value = "";
    updatedPasswordInput.value = "";
    await fetchUsers();
  } catch (error) {
    setMessage(error.message || "パスワード変更に失敗しました。", true);
  }
};

const unlockAdminPage = async () => {
  if (userAdminAuthPage) {
    userAdminAuthPage.hidden = true;
    userAdminAuthPage.style.display = "none";
  }
  if (userAdminProtectedPage) {
    userAdminProtectedPage.hidden = false;
    userAdminProtectedPage.style.display = "flex";
  }
  await fetchUsers();
};

const loginForAdminPage = async (event) => {
  event.preventDefault();

  if (!adminPasswordInput) return;

  const password = adminPasswordInput.value;
  if (!password) {
    setAuthMessage("パスワードを入力してください。", true);
    return;
  }

  setAuthMessage("認証中...");

  const normalizedInput = normalizeAdminPasswordInput(password);
  const normalizedExpected = normalizeAdminPasswordInput(USER_ADMIN_ACCESS_PASSWORD);

  if (normalizedInput !== normalizedExpected) {
    setAuthMessage("パスワードが正しくありません。", true);
    return;
  }

  setAuthMessage("");
  adminPasswordInput.value = "";
  await unlockAdminPage();
};

const initializeAdmin = async () => {
  if (userAdminAuthPage) {
    userAdminAuthPage.hidden = false;
    userAdminAuthPage.style.display = "flex";
  }
  if (userAdminProtectedPage) {
    userAdminProtectedPage.hidden = true;
    userAdminProtectedPage.style.display = "none";
  }

  if (userAdminLoginForm) {
    userAdminLoginForm.addEventListener("submit", loginForAdminPage);
  }
  if (adminPasswordInput) {
    adminPasswordInput.focus();
  }

  if (userCreateForm) {
    userCreateForm.addEventListener("submit", createUser);
  }
  if (passwordUpdateForm) {
    passwordUpdateForm.addEventListener("submit", updatePassword);
  }
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", fetchUsers);
  }
};

initializeAdmin();
