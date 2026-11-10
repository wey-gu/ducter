// The E2E rig's stand-ins for GitHub and npm (scripts/e2e/linux.ts), run inside the Linux VM on
// 127.0.0.1 only: Ducter accepts these sources only from loopback (DUCTER_UPDATE_FEED,
// DUCTER_UPDATE_MIRROR, DUCTER_NPM_REGISTRY), so nothing real is ever replaced by them.
//
//   node servers.mjs <dir> [port]
//
// <dir>/feed.json                        GitHub's releases/latest answer (rewritten between steps)
// <dir>/releases/v<V>/<file>             SHA256SUMS.txt and the tarballs, as release assets
// <dir>/npm/<name>-<V>.tgz, npm/latest   a fake package's versions and its latest dist-tag
// Plain node, no dependencies.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

const dir = process.argv[2];
const port = Number(process.argv[3] ?? 47800);
const PKG = "@earendil-works/pi-coding-agent";
const base = `http://127.0.0.1:${port}`;

const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, { "content-type": type, "content-length": Buffer.byteLength(body) });
  res.end(body);
};

function packument() {
  const files = readdirSync(join(dir, "npm")).filter((f) => f.endsWith(".tgz"));
  const versions = {};
  const time = {};
  for (const f of files) {
    const v = f.replace(/^pi-/, "").replace(/\.tgz$/, "");
    const b = readFileSync(join(dir, "npm", f));
    versions[v] = {
      name: PKG,
      version: v,
      bin: { pi: "bin/pi.js" },
      dist: { tarball: `${base}/-/pi-${v}.tgz`, shasum: createHash("sha1").update(b).digest("hex"), integrity: "sha512-" + createHash("sha512").update(b).digest("base64") },
    };
    time[v] = new Date(0).toISOString();
  }
  const latest = readFileSync(join(dir, "npm", "latest"), "utf8").trim();
  return { name: PKG, "dist-tags": { latest }, versions, time };
}

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  try {
    if (url === "/feed") return send(res, 200, readFileSync(join(dir, "feed.json"), "utf8"));
    let m = /^\/releases\/download\/(v[^/]+)\/([^/]+)$/.exec(url);
    if (m) {
      const f = join(dir, "releases", m[1], m[2]);
      if (!existsSync(f)) return send(res, 404, "not found", "text/plain");
      return send(res, 200, readFileSync(f), "application/octet-stream");
    }
    if (url === `/${PKG}`) return send(res, 200, JSON.stringify(packument()));
    if (url === `/${PKG}/latest`) {
      const p = packument();
      return send(res, 200, JSON.stringify(p.versions[p["dist-tags"].latest] ?? { version: p["dist-tags"].latest }));
    }
    m = /^\/-\/(pi-[^/]+\.tgz)$/.exec(url);
    if (m && existsSync(join(dir, "npm", m[1]))) return send(res, 200, readFileSync(join(dir, "npm", m[1])), "application/octet-stream");
    send(res, 404, JSON.stringify({ error: "not found" }));
  } catch (e) {
    send(res, 500, JSON.stringify({ error: String(e) }));
  }
}).listen(port, "127.0.0.1", () => console.log(`e2e servers on ${base} for ${dir}`));
