"use strict";

function parseCsvLine(line) {
  const cells = [];
  let cell = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(cell); cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function parseSeriesCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV has no observation rows.");
  const headers = parseCsvLine(lines[0]).map(x => x.trim().toLowerCase());
  const timeIndex = headers.indexOf("timestamp");
  const valueIndex = headers.indexOf("value");
  if (timeIndex < 0 || valueIndex < 0) throw new Error("CSV must have timestamp and value columns.");
  const records = lines.slice(1).map((line, i) => {
    const cells = parseCsvLine(line);
    const timestamp = cells[timeIndex]?.trim();
    const value = Number(cells[valueIndex]);
    const time = Date.parse(timestamp);
    if (!timestamp || !Number.isFinite(time)) throw new Error(`Row ${i + 2} has an invalid timestamp.`);
    if (!Number.isFinite(value)) throw new Error(`Row ${i + 2} has an invalid numeric value.`);
    return { timestamp, time, value };
  });
  // Preserve source row order: streaming detectors must see the original sequence.
  return records;
}

module.exports = { parseCsvLine, parseSeriesCsv };

