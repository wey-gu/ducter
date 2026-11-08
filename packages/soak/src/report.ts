#!/usr/bin/env bun
// Turns a soak run's metrics.csv into markdown: a table every N minutes and ASCII charts.
//   bun packages/soak/src/report.ts <root> [everyMin=5]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2]!;
const every = Number(process.argv[3] ?? 5) * 60;
const [head, ...lines] = readFileSync(join(root, "metrics.csv"), "utf8").trim().split("\n");
const cols = head!.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i]!, Number(v)])) as Record<string, number>);

const out: string[] = [];
out.push("| t (min) | RSS (MB) | open FDs | children | head seq | tasks | working | needs you | restarts |");
out.push("|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
let next = 0;
for (const r of rows) {
  if (r.t_s! < next && r !== rows.at(-1)) continue;
  next = r.t_s! + every;
  out.push(`| ${(r.t_s! / 60).toFixed(0)} | ${(r.rss_kb! / 1024).toFixed(0)} | ${r.fds} | ${r.children} | ${r.head_seq} | ${r.tasks} | ${r.working} | ${r.needs_you} | ${r.restarts} |`);
}

function chart(key: string, label: string, scale = 1) {
  const W = 60;
  const H = 8;
  const vals = rows.map((r) => r[key]! / scale);
  const step = Math.max(1, Math.ceil(vals.length / W));
  const pts: number[] = [];
  for (let i = 0; i < vals.length; i += step) pts.push(Math.max(...vals.slice(i, i + step)));
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  if (hi === lo) return `${label}: ${hi} for the whole run`;
  const span = hi - lo || 1;
  const grid = Array.from({ length: H }, () => Array(pts.length).fill(" "));
  pts.forEach((v, x) => {
    const y = Math.round(((v - lo) / span) * (H - 1));
    grid[H - 1 - y]![x] = "*";
  });
  const lines = grid.map((row, i) => `${(hi - (span * i) / (H - 1)).toFixed(0).padStart(6)} |${row.join("")}`);
  return [`${label} (max per column; ${((rows.at(-1)!.t_s! / 60) | 0)} min across)`, "```", ...lines, `       +${"-".repeat(pts.length)}`, "```"].join("\n");
}

console.log(out.join("\n"));
console.log("");
console.log(chart("rss_kb", "RSS of the main process, MB", 1024));
console.log("");
console.log(chart("fds", "Open file descriptors of the main process"));
console.log("");
console.log(chart("children", "Child processes of the main process"));
