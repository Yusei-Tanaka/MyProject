(() => {
  const THEME_STORAGE_KEY = "loginTheme";
  const DEFAULT_THEME = "sky";

  const THEME_MAP = {
    sky: {
      "--color-header-bg": "#2c3e50",
      "--color-header-text": "#ffffff",
      "--color-header-subtext": "#cbd5e1",
      "--color-sidebar-bg": "#f8fafc",
      "--color-heading-bg": "#e1e8ed",
      "--color-heading-text": "#34495e",
      "--color-keyword-bg": "#f8fafc",
      "--color-keyword-border": "#e1e8ed",
      "--color-keyword-button": "#3498db",
      "--color-main-bg": "#f8fafc",
      "--color-main-border": "#e5e7eb",
      "--color-main-button-bg": "#ffffff",
      "--color-main-button-text": "#7f8c8d",
      "--color-canvas-bg": "#ffffff",
      "--color-canvas-grid": "#f1f5f9",
      "--color-hypothesis-bg": "#eff6ff",
      "--color-hypothesis-border": "#bfdbfe",
      "--color-hypothesis-heading": "#1e3a8a",
      "--color-hypothesis-button": "#1d4ed8",
      "--color-extra-bg": "#f1f5f9",
      "--color-extra-border": "#cbd5e1",
      "--color-button-primary": "#3498db",
      "--color-button-primary-hover": "#2b7ab1",
      "--color-button-secondary-border": "#bdc3c7",
      "--color-button-secondary-text": "#7f8c8d",
      "--color-button-secondary-hover": "#ebf5fb",
      "--color-edge": "#95a5a6",
      "--color-node-border": "#3498db",
      "--color-node-highlight": "#e67e22",
      "--color-node-highlight-text": "#ffffff",
      "--login-page-bg": "linear-gradient(140deg, #eef5ff 0%, #f7fbff 100%)",
      "--login-title-color": "#1d2a3f",
      "--login-input-border": "#b8cbea",
      "--login-input-focus": "#3b82f6",
      "--login-button-bg": "#3b82f6",
      "--login-button-hover": "#2563eb",
      "--login-panel-bg": "rgba(255, 255, 255, 0.74)",
      "--login-panel-border": "rgba(59, 130, 246, 0.2)"
    },
    forest: {
      "--color-header-bg": "#1f4330",
      "--color-header-text": "#f4fff6",
      "--color-header-subtext": "#c9e7d3",
      "--color-sidebar-bg": "#f3faf6",
      "--color-heading-bg": "#d9efe1",
      "--color-heading-text": "#28513b",
      "--color-keyword-bg": "#f2fbf5",
      "--color-keyword-border": "#cfe5d8",
      "--color-keyword-button": "#2f855a",
      "--color-main-bg": "#f6fcf8",
      "--color-main-border": "#d5e7dc",
      "--color-main-button-bg": "#ffffff",
      "--color-main-button-text": "#4f6b5d",
      "--color-canvas-bg": "#ffffff",
      "--color-canvas-grid": "#e7f3eb",
      "--color-hypothesis-bg": "#eaf8ef",
      "--color-hypothesis-border": "#bee6cc",
      "--color-hypothesis-heading": "#1f5c3f",
      "--color-hypothesis-button": "#2f855a",
      "--color-extra-bg": "#edf7f0",
      "--color-extra-border": "#c5ddce",
      "--color-button-primary": "#2f855a",
      "--color-button-primary-hover": "#276749",
      "--color-button-secondary-border": "#a6c3b2",
      "--color-button-secondary-text": "#456554",
      "--color-button-secondary-hover": "#e6f4ec",
      "--color-edge": "#6f9880",
      "--color-node-border": "#2f855a",
      "--color-node-highlight": "#d97706",
      "--color-node-highlight-text": "#ffffff",
      "--login-page-bg": "linear-gradient(140deg, #edf7f0 0%, #f6fff8 100%)",
      "--login-title-color": "#1f3a2d",
      "--login-input-border": "#b8ddc5",
      "--login-input-focus": "#2f855a",
      "--login-button-bg": "#2f855a",
      "--login-button-hover": "#276749",
      "--login-panel-bg": "rgba(255, 255, 255, 0.76)",
      "--login-panel-border": "rgba(47, 133, 90, 0.22)"
    },
    sunset: {
      "--color-header-bg": "#4a2d2a",
      "--color-header-text": "#fff8f4",
      "--color-header-subtext": "#f6d7c7",
      "--color-sidebar-bg": "#fff8f3",
      "--color-heading-bg": "#fee7d8",
      "--color-heading-text": "#704032",
      "--color-keyword-bg": "#fff8f1",
      "--color-keyword-border": "#f4d7c5",
      "--color-keyword-button": "#dd6b20",
      "--color-main-bg": "#fffaf5",
      "--color-main-border": "#f1dccd",
      "--color-main-button-bg": "#ffffff",
      "--color-main-button-text": "#8a6154",
      "--color-canvas-bg": "#ffffff",
      "--color-canvas-grid": "#faeee4",
      "--color-hypothesis-bg": "#fff1e6",
      "--color-hypothesis-border": "#fed7aa",
      "--color-hypothesis-heading": "#9a3412",
      "--color-hypothesis-button": "#c2410c",
      "--color-extra-bg": "#fff4eb",
      "--color-extra-border": "#f2d4be",
      "--color-button-primary": "#dd6b20",
      "--color-button-primary-hover": "#c05621",
      "--color-button-secondary-border": "#d8b9a5",
      "--color-button-secondary-text": "#8a6456",
      "--color-button-secondary-hover": "#fff0e6",
      "--color-edge": "#b08975",
      "--color-node-border": "#dd6b20",
      "--color-node-highlight": "#be123c",
      "--color-node-highlight-text": "#ffffff",
      "--login-page-bg": "linear-gradient(145deg, #fff1ea 0%, #fff9f3 100%)",
      "--login-title-color": "#4a2a22",
      "--login-input-border": "#f2c1b1",
      "--login-input-focus": "#dd6b20",
      "--login-button-bg": "#dd6b20",
      "--login-button-hover": "#c05621",
      "--login-panel-bg": "rgba(255, 255, 255, 0.76)",
      "--login-panel-border": "rgba(221, 107, 32, 0.24)"
    },
    slate: {
      "--color-header-bg": "#263445",
      "--color-header-text": "#f8fbff",
      "--color-header-subtext": "#d3dde8",
      "--color-sidebar-bg": "#f4f7fb",
      "--color-heading-bg": "#dee5ed",
      "--color-heading-text": "#334155",
      "--color-keyword-bg": "#f5f8fc",
      "--color-keyword-border": "#d4dce5",
      "--color-keyword-button": "#4b5563",
      "--color-main-bg": "#f8fafc",
      "--color-main-border": "#dae1ea",
      "--color-main-button-bg": "#ffffff",
      "--color-main-button-text": "#5f6f82",
      "--color-canvas-bg": "#ffffff",
      "--color-canvas-grid": "#eef2f7",
      "--color-hypothesis-bg": "#edf2f7",
      "--color-hypothesis-border": "#cbd5e1",
      "--color-hypothesis-heading": "#334155",
      "--color-hypothesis-button": "#475569",
      "--color-extra-bg": "#eef2f7",
      "--color-extra-border": "#cfd8e3",
      "--color-button-primary": "#4b5563",
      "--color-button-primary-hover": "#374151",
      "--color-button-secondary-border": "#b5c0cc",
      "--color-button-secondary-text": "#5f6b78",
      "--color-button-secondary-hover": "#e9eef5",
      "--color-edge": "#7c8ea1",
      "--color-node-border": "#4b5563",
      "--color-node-highlight": "#0f766e",
      "--color-node-highlight-text": "#ffffff",
      "--login-page-bg": "linear-gradient(140deg, #ecf0f5 0%, #f6f8fb 100%)",
      "--login-title-color": "#1f2937",
      "--login-input-border": "#c7d0dc",
      "--login-input-focus": "#4b5563",
      "--login-button-bg": "#4b5563",
      "--login-button-hover": "#374151",
      "--login-panel-bg": "rgba(255, 255, 255, 0.78)",
      "--login-panel-border": "rgba(75, 85, 99, 0.2)"
    }
  };

  const resolveThemeName = (themeName) => (THEME_MAP[themeName] ? themeName : DEFAULT_THEME);

  const THEME_META = {
    sky: { label: "スカイ", color: "#3b82f6" },
    forest: { label: "フォレスト", color: "#2f855a" },
    sunset: { label: "サンセット", color: "#dd6b20" },
    slate: { label: "スレート", color: "#4b5563" }
  };

  let switcherRoot = null;
  const dotsByTheme = new Map();

  const updateActiveDot = (themeName) => {
    dotsByTheme.forEach((dot, name) => {
      const isActive = name === themeName;
      dot.classList.toggle("is-active", isActive);
      dot.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const applyAppTheme = (themeName, persist = true) => {
    const selected = resolveThemeName(themeName);
    const themeVars = THEME_MAP[selected];
    Object.entries(themeVars).forEach(([name, value]) => {
      document.documentElement.style.setProperty(name, value);
    });
    document.documentElement.setAttribute("data-theme", selected);
    if (persist) {
      localStorage.setItem(THEME_STORAGE_KEY, selected);
    }
    updateActiveDot(selected);
    return selected;
  };

  const getStoredTheme = () => resolveThemeName(localStorage.getItem(THEME_STORAGE_KEY));

  const createThemeSwitcher = () => {
    if (switcherRoot || !document.body) return;

    if (document.querySelector(".header")) {
      document.body.classList.add("has-app-header");
    }

    const root = document.createElement("div");
    root.className = "theme-switcher";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "表示テーマ切替");

    const label = document.createElement("span");
    label.className = "theme-switcher-label";
    label.textContent = "テーマ";
    root.appendChild(label);

    const palette = document.createElement("div");
    palette.className = "theme-switcher-palette";

    Object.keys(THEME_MAP).forEach((themeName) => {
      const meta = THEME_META[themeName] || { label: themeName, color: "#94a3b8" };
      const button = document.createElement("button");
      button.type = "button";
      button.className = "theme-switcher-dot";
      button.style.backgroundColor = meta.color;
      button.title = `${meta.label}テーマ`;
      button.setAttribute("aria-label", `${meta.label}テーマに変更`);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => {
        applyAppTheme(themeName, true);
      });

      dotsByTheme.set(themeName, button);
      palette.appendChild(button);
    });

    root.appendChild(palette);
    document.body.appendChild(root);
    switcherRoot = root;
    updateActiveDot(getStoredTheme());
  };

  window.APP_THEME_STORAGE_KEY = THEME_STORAGE_KEY;
  window.APP_THEME_MAP = THEME_MAP;
  window.applyAppTheme = applyAppTheme;
  window.getStoredAppTheme = getStoredTheme;

  const currentTheme = applyAppTheme(getStoredTheme(), false);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      createThemeSwitcher();
      updateActiveDot(currentTheme);
    });
  } else {
    createThemeSwitcher();
    updateActiveDot(currentTheme);
  }
})();
