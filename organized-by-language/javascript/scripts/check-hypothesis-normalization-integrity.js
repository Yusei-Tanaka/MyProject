#!/usr/bin/env node
require("dotenv").config({ override: true });

const mysql = require("mysql2/promise");

const asNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: "Z",
  });

  const checks = [];

  try {
    const [spreadHtmlColumnRows] = await connection.execute(
      "SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hypothesis_spreads' AND column_name = 'hypothesis_html'"
    );
    checks.push({
      name: "legacy_column_hypothesis_html_removed",
      ok: Number(spreadHtmlColumnRows[0]?.c || 0) === 0,
      detail: `count=${spreadHtmlColumnRows[0]?.c || 0}`,
    });

    const [nodeThemeVersionColumnRows] = await connection.execute(
      "SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'hypothesis_nodes' AND column_name = 'theme_version_id'"
    );
    checks.push({
      name: "legacy_column_theme_version_id_removed",
      ok: Number(nodeThemeVersionColumnRows[0]?.c || 0) === 0,
      detail: `count=${nodeThemeVersionColumnRows[0]?.c || 0}`,
    });

    const [nullSpreadRefRows] = await connection.execute(
      "SELECT COUNT(*) AS c FROM hypothesis_nodes WHERE hypothesis_spread_id IS NULL"
    );
    checks.push({
      name: "hypothesis_nodes_spread_fk_not_null",
      ok: Number(nullSpreadRefRows[0]?.c || 0) === 0,
      detail: `null_count=${nullSpreadRefRows[0]?.c || 0}`,
    });

    const [countMismatchRows] = await connection.execute(
      `SELECT COUNT(*) AS c
         FROM hypothesis_spreads hs
         LEFT JOIN (
           SELECT hypothesis_spread_id, COUNT(*) AS node_count
             FROM hypothesis_nodes
            GROUP BY hypothesis_spread_id
         ) n ON n.hypothesis_spread_id = hs.id
        WHERE hs.hypothesis_node_count <> COALESCE(n.node_count, 0)`
    );
    checks.push({
      name: "spread_node_count_matches_actual",
      ok: Number(countMismatchRows[0]?.c || 0) === 0,
      detail: `mismatch_count=${countMismatchRows[0]?.c || 0}`,
    });

    const [summaryMismatchRows] = await connection.execute(
      `SELECT COUNT(*) AS c
         FROM hypothesis_spreads hs
         LEFT JOIN (
           SELECT hypothesis_spread_id, COUNT(*) AS node_count
             FROM hypothesis_nodes
            GROUP BY hypothesis_spread_id
         ) n ON n.hypothesis_spread_id = hs.id
        WHERE JSON_EXTRACT(hs.hypothesis_summary_json, '$.totalCount') IS NOT NULL
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(hs.hypothesis_summary_json, '$.totalCount')) AS UNSIGNED)
              <> COALESCE(n.node_count, 0)`
    );
    checks.push({
      name: "summary_totalCount_matches_actual",
      ok: Number(summaryMismatchRows[0]?.c || 0) === 0,
      detail: `mismatch_count=${summaryMismatchRows[0]?.c || 0}`,
    });

    const [duplicateOrderRows] = await connection.execute(
      `SELECT COUNT(*) AS c
         FROM (
           SELECT hypothesis_spread_id, node_order
             FROM hypothesis_nodes
            GROUP BY hypothesis_spread_id, node_order
           HAVING COUNT(*) > 1
         ) d`
    );
    checks.push({
      name: "node_order_unique_within_spread",
      ok: Number(duplicateOrderRows[0]?.c || 0) === 0,
      detail: `duplicate_pairs=${duplicateOrderRows[0]?.c || 0}`,
    });

    const [totalsRows] = await connection.execute(
      `SELECT
         (SELECT COUNT(*) FROM themes) AS themes_count,
         (SELECT COUNT(*) FROM theme_versions) AS theme_versions_count,
         (SELECT COUNT(*) FROM hypothesis_spreads) AS hypothesis_spreads_count,
         (SELECT COUNT(*) FROM hypothesis_nodes) AS hypothesis_nodes_count`
    );

    const totals = totalsRows[0] || {};
    console.log("Totals:", {
      themes: asNumber(totals.themes_count),
      themeVersions: asNumber(totals.theme_versions_count),
      hypothesisSpreads: asNumber(totals.hypothesis_spreads_count),
      hypothesisNodes: asNumber(totals.hypothesis_nodes_count),
    });

    let hasFailure = false;
    for (const check of checks) {
      const status = check.ok ? "PASS" : "FAIL";
      if (!check.ok) hasFailure = true;
      console.log(`[${status}] ${check.name} (${check.detail})`);
    }

    if (hasFailure) {
      process.exitCode = 1;
      console.error("Integrity check failed.");
      return;
    }

    console.log("Integrity check passed.");
  } finally {
    await connection.end();
  }
})().catch((error) => {
  console.error("Integrity check execution failed:", error.message || error);
  process.exit(1);
});
