const ADMIN_MENU_DEFAULT = "";

const getPhpMyAdminUrl = () => {
  const config = window.APP_CONFIG || {};
  if (typeof config.phpMyAdminUrl === "string" && config.phpMyAdminUrl.trim()) {
    return config.phpMyAdminUrl.trim();
  }

  const protocol = (config.protocol || "http").toLowerCase() === "https" ? "https" : "http";
  const host = config.host || window.location.hostname || "127.0.0.1";
  const path = String(config.phpMyAdminPath || "/phpmyadmin").trim();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${protocol}://${host}${normalizedPath}`;
};

const handleAdminMenuSelect = (selectElement) => {
  const rawValue = (selectElement.value || "").trim();
  const value = rawValue === "phpmyadmin" ? getPhpMyAdminUrl() : rawValue;
  if (!value) return;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    window.open(value, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = value;
  }

  selectElement.value = ADMIN_MENU_DEFAULT;
};

const setupAdminMenu = (selector) => {
  const selectElement = document.querySelector(selector);
  if (!selectElement) return;

  selectElement.addEventListener("change", () => handleAdminMenuSelect(selectElement));
};

setupAdminMenu("#adminMenuSelect");
setupAdminMenu("#headerAdminMenuSelect");
