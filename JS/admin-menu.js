const ADMIN_MENU_DEFAULT = "";

const handleAdminMenuSelect = (selectElement) => {
  const value = (selectElement.value || "").trim();
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
