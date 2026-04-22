const appConfig = window.APP_CONFIG || {};
const userAdminHost = appConfig.host || window.location.hostname || "127.0.0.1";
const userAdminApiPort = Number(appConfig.apiPort || 3000);
const userAdminBaseUrl =
  appConfig.apiBaseUrl ||
  `http://${userAdminHost}:${userAdminApiPort}`;

const userAdminAuthPage = document.getElementById("userAdminAuthPage");
const userAdminProtectedPage = document.getElementById("userAdminProtectedPage");
const userAdminLoginForm = document.getElementById("userAdminLoginForm");
const openUserAdminBtn = document.getElementById("openUserAdminBtn");
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
const openPhpMyAdminBtn = document.getElementById("openPhpMyAdminBtn");
const userList = document.getElementById("userList");
const userAdminMessage = document.getElementById("userAdminMessage");

var t = (key, vars = {}, fallback = "") => {
  if (window.APP_I18N && typeof window.APP_I18N.t === "function") {
    return window.APP_I18N.t(key, vars, fallback);
  }
  return fallback || key;
};

let isAdminLoginInProgress = false;

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
    empty.dataset.emptyState = "true";
    empty.textContent = t("userAdmin.noUsers", {}, "ユーザが登録されていません。");
    userList.appendChild(empty);
    return;
  }

  users.forEach((user) => {
    const item = document.createElement("li");
    item.textContent = user.id;
    item.dataset.userId = String(user.id || "").trim();
    item.title = t("userAdmin.rightClickDelete", {}, "右クリックで削除");
    userList.appendChild(item);
  });
};

const deleteUserById = async (id) => {
  const userId = String(id || "").trim();
  if (!userId) return;

  setMessage(t("userAdmin.deletingUser", { userId }, `ユーザ「${userId}」を削除中...`));

  try {
    const response = await fetch(`${userAdminBaseUrl}/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || t("userAdmin.deleteUserFailed", {}, "ユーザ削除に失敗しました。"));
    }

    setMessage(t("userAdmin.userDeleted", { userId }, `ユーザ「${userId}」を削除しました。`));
    await fetchUsers();
  } catch (error) {
    setMessage(error.message || t("userAdmin.deleteUserFailed", {}, "ユーザ削除に失敗しました。"), true);
  }
};

const handleUserListContextMenu = async (event) => {
  const targetItem = event.target.closest("li");
  if (!targetItem || !userList || !userList.contains(targetItem)) return;

  event.preventDefault();

  if (targetItem.dataset.emptyState === "true") return;

  const userId = String(targetItem.dataset.userId || targetItem.textContent || "").trim();
  if (!userId) return;

  const shouldDelete = window.confirm(
    t("userAdmin.confirmDeleteUser", { userId }, `ユーザ「${userId}」を削除します。\nよろしいですか？`)
  );
  if (!shouldDelete) return;

  await deleteUserById(userId);
};

const syncPasswordTargetUsersFromList = () => {
  if (!passwordTargetUserIdInput || !userList) return;

  const previousValue = passwordTargetUserIdInput.value;
  passwordTargetUserIdInput.innerHTML = "";

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = t("userAdmin.selectTargetUser", {}, "変更対象ユーザIDを選択");
  passwordTargetUserIdInput.appendChild(placeholderOption);

  const listItems = Array.from(userList.querySelectorAll("li"));
  if (listItems.length === 0) {
    passwordTargetUserIdInput.value = "";
    return;
  }

  listItems.forEach((item) => {
    if (item.dataset.emptyState === "true") return;

    const id = String(item.dataset.userId || item.textContent || "").trim();
    if (!id) return;
    if (id === "undefined" || id === "null") return;
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    passwordTargetUserIdInput.appendChild(option);
  });

  const hasPrevious = Array.from(passwordTargetUserIdInput.options).some((option) => option.value === previousValue);
  passwordTargetUserIdInput.value = hasPrevious ? previousValue : "";
};

const fetchUsers = async () => {
  setMessage(t("userAdmin.fetchingUsers", {}, "ユーザ一覧を取得中..."));
  try {
    const response = await fetch(`${userAdminBaseUrl}/users`);
    const body = await response.json().catch(() => []);

    if (!response.ok) {
      throw new Error(body.error || t("userAdmin.fetchUsersFailed", {}, "ユーザ一覧の取得に失敗しました。"));
    }

    const users = Array.isArray(body) ? body : [];
    renderUsers(users);
    syncPasswordTargetUsersFromList();
    setMessage(t("userAdmin.usersUpdated", { count: users.length }, `ユーザ一覧を更新しました（${users.length}件）。`));
  } catch (error) {
    renderUsers([]);
    syncPasswordTargetUsersFromList();
    setMessage(error.message || t("userAdmin.fetchUsersFailed", {}, "ユーザ一覧の取得に失敗しました。"), true);
  }
};

const createUser = async (event) => {
  event.preventDefault();

  const id = newUserIdInput.value.trim();
  const passwordHash = newUserPasswordInput.value.trim();
  if (!id || !passwordHash) {
    setMessage(t("userAdmin.enterUserAndPassword", {}, "ユーザIDとパスワードを入力してください。"), true);
    return;
  }

  setMessage(t("userAdmin.creatingUser", {}, "ユーザを登録中..."));

  try {
    const response = await fetch(`${userAdminBaseUrl}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, passwordHash }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || t("userAdmin.createUserFailed", {}, "ユーザ登録に失敗しました。"));
    }

    setMessage(t("userAdmin.userCreated", { userId: body.id }, `ユーザ「${body.id}」を登録しました。`));
    newUserIdInput.value = "";
    newUserPasswordInput.value = "";
    await fetchUsers();
  } catch (error) {
    setMessage(error.message || t("userAdmin.createUserFailed", {}, "ユーザ登録に失敗しました。"), true);
  }
};

const updatePassword = async (event) => {
  event.preventDefault();

  const id = passwordTargetUserIdInput.value.trim();
  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = updatedPasswordInput.value.trim();
  if (!id || !currentPassword || !newPassword) {
    setMessage(
      t(
        "userAdmin.enterPasswordUpdateFields",
        {},
        "変更対象ユーザID・現在のパスワード・新しいパスワードを入力してください。"
      ),
      true
    );
    return;
  }

  setMessage(t("userAdmin.updatingPassword", {}, "パスワードを変更中..."));

  try {
    const response = await fetch(`${userAdminBaseUrl}/users/${encodeURIComponent(id)}/password`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || t("userAdmin.updatePasswordFailed", {}, "パスワード変更に失敗しました。"));
    }

    setMessage(t("userAdmin.passwordUpdated", { userId: id }, `ユーザ「${id}」のパスワードを変更しました。`));
    passwordTargetUserIdInput.value = "";
    currentPasswordInput.value = "";
    updatedPasswordInput.value = "";
    await fetchUsers();
  } catch (error) {
    const message = error.message || t("userAdmin.updatePasswordFailed", {}, "パスワード変更に失敗しました。");
    if (message.includes("invalid current password")) {
      currentPasswordInput.value = "";
      currentPasswordInput.focus();
    }
    setMessage(message, true);
  }
};

const unlockAdminPage = async () => {
  if (userAdminAuthPage) {
    userAdminAuthPage.hidden = true;
  }
  if (userAdminProtectedPage) {
    userAdminProtectedPage.hidden = false;
  }
  await fetchUsers();
};

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

const authenticateAdminAccess = async (password) => {
  let response;
  try {
    response = await fetchWithTimeout(
      `${userAdminBaseUrl}/admin/auth`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      8000
    );
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(t("userAdmin.authTimeout", {}, "認証サーバへの接続がタイムアウトしました。もう一度お試しください。"));
    }
    throw new Error(t("userAdmin.authServerUnavailable", {}, "認証サーバへ接続できません。サーバ起動状態を確認してください。"));
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || t("userAdmin.authFailed", {}, "認証に失敗しました。API接続を確認してください。"));
  }

  return true;
};

const loginForAdminPage = async (event) => {
  if (event) {
    event.preventDefault();
  }

  if (isAdminLoginInProgress) {
    return;
  }

  if (!adminPasswordInput) return;

  const password = adminPasswordInput.value;
  if (!password) {
    setAuthMessage(t("userAdmin.enterAdminPassword", {}, "パスワードを入力してください。"), true);
    return;
  }

  setAuthMessage(t("userAdmin.authInProgress", {}, "認証中..."));
  isAdminLoginInProgress = true;
  if (openUserAdminBtn) {
    openUserAdminBtn.disabled = true;
  }

  try {
    await authenticateAdminAccess(password);
  } catch (error) {
    adminPasswordInput.value = "";
    adminPasswordInput.focus();
    setAuthMessage(error.message || t("userAdmin.incorrectPassword", {}, "パスワードが正しくありません。"), true);
    isAdminLoginInProgress = false;
    if (openUserAdminBtn) {
      openUserAdminBtn.disabled = false;
    }
    return;
  }

  setAuthMessage("");
  adminPasswordInput.value = "";
  isAdminLoginInProgress = false;
  if (openUserAdminBtn) {
    openUserAdminBtn.disabled = false;
  }
  await unlockAdminPage();
};

const initializeAdmin = async () => {
  if (openPhpMyAdminBtn) {
    openPhpMyAdminBtn.href = appConfig.phpMyAdminUrl || `http://${userAdminHost}/phpmyadmin`;
  }

  if (userAdminAuthPage) {
    userAdminAuthPage.hidden = false;
  }
  if (userAdminProtectedPage) {
    userAdminProtectedPage.hidden = true;
  }

  if (userAdminLoginForm) {
    userAdminLoginForm.addEventListener("submit", loginForAdminPage);
  }
  if (openUserAdminBtn) {
    openUserAdminBtn.addEventListener("click", loginForAdminPage);
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
  if (userList) {
    userList.addEventListener("contextmenu", handleUserListContextMenu);
  }
};

initializeAdmin();
