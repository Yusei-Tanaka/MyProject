(() => {
  const rawConfig = {
  "protocol": "http",
  "host": "auto",
  "apiPort": 3000,
  "saveXmlPort": 3005,
  "flaskApiPort": 8000,
  "phpMyAdminPath": "/phpmyadmin"
};

  const resolvedHost =
    rawConfig.host && rawConfig.host !== "auto"
      ? rawConfig.host
      : (window.location.hostname || "127.0.0.1");

  const withPort = (port) => `${rawConfig.protocol}://${resolvedHost}:${port}`;

  window.APP_CONFIG = {
    ...rawConfig,
    host: resolvedHost,
    apiBaseUrl: withPort(rawConfig.apiPort),
    saveXmlBaseUrl: withPort(rawConfig.saveXmlPort),
    flaskApiBaseUrl: withPort(rawConfig.flaskApiPort),
    phpMyAdminUrl: `${rawConfig.protocol}://${resolvedHost}${rawConfig.phpMyAdminPath}`,
  };
})();
