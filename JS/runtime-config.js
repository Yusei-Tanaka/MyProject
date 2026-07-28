(() => {
  const rawConfig = {
  "protocol": "http",
<<<<<<< HEAD
  "host": "auto",
  "apiPort": 3000,
  "saveXmlPort": 3005,
=======
  "host": "10.158.102.176",
  "apiPort": 3000,
>>>>>>> c319aea2e42d5f6512abd34c436286e8d24e7a6b
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
    flaskApiBaseUrl: withPort(rawConfig.flaskApiPort),
    phpMyAdminUrl: `${rawConfig.protocol}://${resolvedHost}${rawConfig.phpMyAdminPath}`,
  };
})();
