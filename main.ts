// Token launch radar — entry program (Node 22, standard library only).
//
// Reads the sealed snapshot (--input <file|dir>, default /input), ranks every
// protocol that records no token with the model in lib/model.ts, and hands in:
//   board.json    the ranked board the gate checks
//   data.js       the same board with full detail, for the dashboard
//   dashboard/    the static page (board, detail view, filters)
//   screenshots/  three renders of the page
//   dossier.json  the judge's summary, written by vendor/makefun-board.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBoard, type Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

function argValue(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1] !== undefined) return process.argv[at + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

const inputArg = argValue("input", "/input");
const inputFile = inputArg.endsWith(".json") ? inputArg : join(inputArg, "snapshot.json");
if (!existsSync(inputFile)) {
  process.stderr.write(`radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const outDir = argValue("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

const snapshot = JSON.parse(readFileSync(inputFile, "utf8")) as Snapshot;
const board = buildBoard(snapshot);

// Self-check the gate's shape before writing anything: a board that cannot
// pass is a wasted submission, and these are the rows the scorer names.
const watchlist = new Set(snapshot.watchlist);
const covered = new Set(board.rows.map((r) => r.slug));
const missing = [...watchlist].filter((slug) => !covered.has(slug));
if (missing.length > 0) {
  process.stderr.write(`radar: watchlist protocols missing from the board: ${missing.join(", ")}\n`);
  process.exit(1);
}
for (let i = 1; i < board.rows.length; i++) {
  if (board.rows[i].implied_value_usd > board.rows[i - 1].implied_value_usd) {
    process.stderr.write(`radar: board is not sorted by value at rank ${i + 1}\n`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });

// board.json carries exactly the gate's fields per row.
const boardRows = board.rows.map((r) => ({
  slug: r.slug,
  name: r.name,
  rank: r.rank,
  implied_value_usd: r.implied_value_usd,
  farm_steps: r.farm_steps,
}));
writeFileSync(join(outDir, "board.json"), JSON.stringify({ rows: boardRows }) + "\n");

// data.js carries everything the dashboard shows, including the model's
// working for the detail view.
const data = {
  as_of: board.as_of,
  floor_usd: board.floor_usd,
  scanned: board.scanned,
  candidates: board.candidates,
  tokenized: board.tokenized,
  set_aside: board.set_aside,
  watchlist_count: board.watchlist_count,
  rows: board.rows,
};
writeFileSync(join(outDir, "data.js"), "window.RADAR_DATA = " + JSON.stringify(data) + ";\n");

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyDir(join(root, "dashboard"), join(outDir, "dashboard"));
const shots = copyDir(join(root, "screenshots"), join(outDir, "screenshots"));
if (shots.length < 3) {
  process.stderr.write(`radar: screenshots/ holds ${shots.length} images; 3 are required\n`);
  process.exit(1);
}

writeFileSync(
  join(outDir, "dossier.json"),
  buildDossier(outDir, {
    text_max_bytes: 65_536,
    screenshots: { max: 4, max_bytes: 524_288 },
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  }),
);

process.stdout.write(
  `radar: scanned ${board.scanned} protocols (${board.tokenized} already tokenised, ${board.set_aside} wrapped/staked/exchange products set aside), ` +
    `ranked ${board.rows.length} pre-token protocols, watchlist ${board.watchlist_count}/${board.watchlist_count} covered\n`,
);
