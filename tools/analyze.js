#!/usr/bin/env node
/*
 * Перевірка відтворюваності з командного рядка — той самий рушій, що й на сайті.
 *   node tools/analyze.js шлях/до/файлу.xlsx            → короткі контрольні підсумки
 *   node tools/analyze.js файл.xlsx --json reports/      → записати звіт у reports/<період>.json і оновити index.json
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const XLSX = require("../assets/vendor/xlsx.full.min.js");
const Engine = require("../assets/engine.js");

function readRows(file) {
  const buf = fs.readFileSync(file);
  const wb = XLSX.read(buf, { type: "buffer" });
  const name = wb.SheetNames.includes("Статті") ? "Статті" : wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: "", raw: true });
  return { rows, hash: crypto.createHash("sha256").update(buf).digest("hex") };
}

const file = process.argv[2];
if (!file) { console.error("Вкажіть шлях до xlsx"); process.exit(1); }
const { rows, hash } = readRows(file);
const fileName = process.argv.includes("--name") ? process.argv[process.argv.indexOf("--name") + 1] : path.basename(file);
const report = Engine.analyze(rows, { fileName, fileHash: hash, createdAt: new Date().toISOString() });
const c = report.control;
console.log(JSON.stringify({ id: report.id, ...c }, null, 1));

const ji = process.argv.indexOf("--json");
if (ji > 0) {
  const dir = process.argv[ji + 1] || "reports";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, report.id + ".json"), JSON.stringify(report));
  const idxPath = path.join(dir, "index.json");
  let idx = { reports: [] };
  try { idx = JSON.parse(fs.readFileSync(idxPath, "utf8")); } catch (e) {}
  idx.reports = (idx.reports || []).filter(r => r.id !== report.id);
  idx.reports.push({
    id: report.id, from: report.period.from, to: report.period.to, fileName: report.fileName, fileHash: report.fileHash,
    savedAt: report.createdAt, v: report.v, materials: c.materials, viewsAll: c.viewsAll, viewsEditorial: c.viewsEditorial
  });
  idx.reports.sort((a, b) => b.to.localeCompare(a.to) || b.from.localeCompare(a.from));
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1));
  console.log("→", path.join(dir, report.id + ".json"));
}
