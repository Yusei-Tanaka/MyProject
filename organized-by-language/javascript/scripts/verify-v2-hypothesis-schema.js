#!/usr/bin/env node
require("dotenv").config({ override: true });

const mysql = require("mysql2/promise");

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: "Z",
  });

  const [spreadCols] = await connection.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hypothesis_spreads' ORDER BY ordinal_position"
  );
  const [nodeCols] = await connection.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hypothesis_nodes' ORDER BY ordinal_position"
  );
  const [nodeFks] = await connection.query(
    "SELECT constraint_name, column_name, referenced_table_name, referenced_column_name FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = 'hypothesis_nodes' AND referenced_table_name IS NOT NULL ORDER BY constraint_name"
  );

  console.log("hypothesis_spreads columns:", spreadCols.map((r) => r.column_name).join(", "));
  console.log("hypothesis_nodes columns:", nodeCols.map((r) => r.column_name).join(", "));
  console.log("hypothesis_nodes foreign keys:", JSON.stringify(nodeFks));

  await connection.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
