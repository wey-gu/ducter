// D431: an app's things live in its data, not in its file (design/apps.md, "What Ducter knows goes
// in"). A list of the person's items written into the file as a literal (`const PRS = [{…}, {…}]`) is
// lifted into the app's data, the file reading it back with ducter.get: the same values, so nothing
// they see changes, and from then on every device, the partner and a routine can read and fill them.
// Rows written into the markup itself can't be lifted by hand; the lint says so to the partner.

/**
 * A pure JSON-like literal in a script (arrays, objects, strings, numbers, true/false/null, comments,
 * trailing commas, unquoted keys), as the value it makes; anything else (a name, a call, a template
 * with ${}) is not one. Returns the value and where the literal ends.
 */
export function jsLiteral(s: string, at: number): { v: unknown; end: number } | undefined {
  let i = at;
  const ws = () => {
    for (;;) {
      while (i < s.length && /\s/.test(s[i]!)) i++;
      if (s.startsWith("//", i)) {
        const n = s.indexOf("\n", i);
        i = n < 0 ? s.length : n;
      } else if (s.startsWith("/*", i)) {
        const n = s.indexOf("*/", i + 2);
        if (n < 0) return false;
        i = n + 2;
      } else return true;
    }
  };
  const str = (): string | undefined => {
    const q = s[i]!;
    let out = "";
    i++;
    while (i < s.length && s[i] !== q) {
      let c = s[i]!;
      if (q === "`" && c === "$" && s[i + 1] === "{") return undefined;
      if (c === "\\") {
        const e = s[++i];
        if (e === undefined) return undefined;
        if (e === "u") {
          const h = /^[0-9a-fA-F]{4}/.exec(s.slice(i + 1, i + 5));
          if (!h) return undefined;
          c = String.fromCharCode(parseInt(h[0], 16));
          i += 4;
        } else c = ({ n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", "0": "\0" } as Record<string, string>)[e] ?? (e === "\n" ? "" : e);
      } else if (c === "\n" && q !== "`") return undefined;
      out += c;
      i++;
    }
    if (s[i] !== q) return undefined;
    i++;
    return out;
  };
  const val = (depth: number): { v: unknown } | undefined => {
    if (depth > 8 || !ws()) return undefined;
    const c = s[i];
    if (c === "[" || c === "{") {
      const arr = c === "[";
      const close = arr ? "]" : "}";
      const out: unknown[] | Record<string, unknown> = arr ? [] : {};
      i++;
      for (;;) {
        if (!ws()) return undefined;
        if (s[i] === close) {
          i++;
          return { v: out };
        }
        if (arr) {
          const x = val(depth + 1);
          if (!x) return undefined;
          (out as unknown[]).push(x.v);
        } else {
          let k: string | undefined;
          if (s[i] === '"' || s[i] === "'") k = str();
          else {
            const m = /^[A-Za-z_$][\w$]*|^\d+/.exec(s.slice(i, i + 80));
            if (m) {
              k = m[0];
              i += m[0].length;
            }
          }
          if (k === undefined || !ws() || s[i] !== ":") return undefined;
          i++;
          const x = val(depth + 1);
          if (!x) return undefined;
          (out as Record<string, unknown>)[k] = x.v;
        }
        if (!ws()) return undefined;
        if (s[i] === ",") i++;
        else if (s[i] !== close) return undefined;
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      const x = str();
      return x === undefined ? undefined : { v: x };
    }
    const m = /^(-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?|true|false|null)(?![\w$])/.exec(s.slice(i, i + 40));
    if (!m) return undefined;
    i += m[0].length;
    return { v: m[0] === "true" ? true : m[0] === "false" ? false : m[0] === "null" ? null : Number(m[0]) };
  };
  const r = val(0);
  return r ? { v: r.v, end: i } : undefined;
}

/** The scripts of a file (no src), as [start, end) of their text. */
function scripts(html: string): [number, number][] {
  const out: [number, number][] = [];
  const low = html.toLowerCase();
  const re = /<script\b(?![^>]*\bsrc\s*=)[^>]*>/gi;
  for (let m; (m = re.exec(html)); ) {
    const end = low.indexOf("</script", re.lastIndex);
    if (end < 0) break;
    out.push([re.lastIndex, end]);
    re.lastIndex = end;
  }
  return out;
}

/** A list the app works with, not the person's things: its categories, colours, words, choices. */
const CONFIG_NAME = /^(cats?|categor|colou?r|cols?$|options?|tabs?|units?|labels?|words?|strings?|langs?|kinds?|types?|i18n|icons?|emoji|steps?|chips?|filters?|modes?|presets?|[a-z]$)/i;
const keyOk = (k: string) => k.length > 0 && k.length <= 64 && !/[\p{Cc}]/u.test(k);

/**
 * The person's items written into an app's file as a list, lifted into its data: the same values under
 * a key of the list's name, the file reading them back with ducter.get. Only where it changes nothing
 * they see: a list of two or more objects in a pure literal, a name that isn't one of the app's own
 * settings, a key the file doesn't name and the data doesn't have. Also a list given as the fallback of
 * a key the data doesn't have (`ducter.get("x") || […]`): the data gets it, the file stays. Undefined:
 * nothing to lift.
 */
export function appLiftItems(html: string, data: Record<string, unknown>): { html: string; data: Record<string, unknown>; keys: string[] } | undefined {
  const items = (v: unknown): v is Record<string, unknown>[] => Array.isArray(v) && v.length >= 2 && v.every((x) => !!x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length > 0);
  const quoted = (k: string) => new RegExp(`["'\`]${k.replace(/\$/g, "\\$")}["'\`]`).test(html);
  const add: Record<string, unknown> = {};
  const cuts: { from: number; to: number; text: string }[] = [];
  for (const [a, b] of scripts(html)) {
    const js = html.slice(a, b);
    const decl = /(^|[\s;{}(])(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?=\[)/g;
    for (let m; (m = decl.exec(js)); ) {
      const name = m[3]!;
      const lit = jsLiteral(js, decl.lastIndex);
      if (!lit || !items(lit.v) || CONFIG_NAME.test(name)) continue;
      const key = /^[A-Z0-9_$]+$/.test(name) ? name.toLowerCase() : name;
      if (!keyOk(key) || key in data || key in add || quoted(key) || JSON.stringify(lit.v).length > 50_000) continue;
      add[key] = lit.v;
      cuts.push({ from: a + decl.lastIndex, to: a + lit.end, text: `ducter.get(${JSON.stringify(key)}) || []` });
      decl.lastIndex = lit.end;
    }
    const fb = /ducter\.get\(\s*(["'])([^"'\n]{1,64})\1\s*\)\s*(\|\||\?\?)\s*(?=\[)/g;
    for (let m; (m = fb.exec(js)); ) {
      const key = m[2]!;
      const lit = jsLiteral(js, fb.lastIndex);
      if (!lit || !items(lit.v) || !keyOk(key) || data[key] != null || key in add) continue;
      add[key] = lit.v;
    }
  }
  const keys = Object.keys(add);
  if (!keys.length) return undefined;
  let out = html;
  for (const c of cuts.sort((x, y) => y.from - x.from)) out = out.slice(0, c.from) + c.text + out.slice(c.to);
  return { html: out, data: { ...data, ...add }, keys };
}

/** Rows written into the markup itself (outside its scripts and styles): the person's items where only the file holds them. */
export function appRowsInMarkup(html: string): number {
  const bare = html.replace(/<script\b[\s\S]*?<\/script\s*>/gi, "").replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");
  return (bare.match(/class\s*=\s*["'][^"']*\bk-row(?![\w-])/g) ?? []).length;
}
