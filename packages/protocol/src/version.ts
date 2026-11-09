// The Ducter version this build is (D146). The release tag must equal packages/cli/package.json's
// version (release.yml's `meta` job), so that file is the one source for every part of Ducter.
import pkg from "../../cli/package.json" with { type: "json" };

export const DUCTER_VERSION: string = pkg.version;

interface Semver {
  core: number[];
  pre: string[];
}

function parse(v: string): Semver | undefined {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(v.trim());
  if (!m) return undefined;
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] ? m[4].split(".") : [] };
}

export const isVersion = (v: string | undefined): v is string => Boolean(v && parse(v));

/** Semver order: -1, 0 or 1. A pre-release sorts before its release; unparseable sorts first. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! < y.core[i]! ? -1 : 1;
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1;
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** A version without its leading v. */
export const bareVersion = (v: string) => v.trim().replace(/^v/, "");
