const adminLinks = document.querySelectorAll(".admin-link-button, .header-admin-link");

const verifyAdminPassword = async (password) => {
  const host = window.location.hostname || "localhost";
  const apiUrl = `http://${host}:3000/auth/admin-access`;

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return true;
};

const moveToAdmin = async (event) => {
  event.preventDefault();
  const link = event.currentTarget;
  const targetUrl = link.getAttribute("href");
  const targetType = link.getAttribute("target");

  const password = window.prompt("管理画面用パスワードを入力してください");
  if (password === null) return;

  try {
    await verifyAdminPassword(password);
    if (targetType === "_blank") {
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } else {
      window.location.href = targetUrl;
    }
  } catch (error) {
    console.error(error);
    window.alert("パスワードが違うか、認証に失敗しました。");
  }
};

adminLinks.forEach((link) => {
  link.addEventListener("click", moveToAdmin);
});
