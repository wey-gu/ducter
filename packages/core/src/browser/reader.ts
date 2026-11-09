// What a task reads of a page (D144): visible text in reading order, with a number on each thing
// it can act on ([3] button "Sign in"). Runs inside the page (Runtime.evaluate). Never returns
// the value of a password or one-time-code field, and marks those fields so the tools refuse to
// type into them: signing in is always the user's, in the live view.

// In-page globals, typed loosely: this file has no DOM lib (the function runs in the page).
declare const document: any, location: any, getComputedStyle: any, CSS: any, Node: any;
declare const HTMLInputElement: any, HTMLTextAreaElement: any, HTMLSelectElement: any;

/** Serialised into the page; returns { title, url, lines, refs }. */
function readPage(maxLines: number) {
  const SECRET = (el: any): boolean => {
    if (!(el instanceof HTMLInputElement)) return false;
    const ac = (el.autocomplete || "").toLowerCase();
    return el.type === "password" || ac.includes("one-time-code") || ac.includes("current-password") || ac.includes("new-password") || /otp|2fa|totp|passcode/i.test(el.name + " " + el.id);
  };
  const visible = (el: any): boolean => {
    const r = (el as any).getBoundingClientRect?.();
    if (!r || (r.width === 0 && r.height === 0)) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0;
  };
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const label = (el: any): string => {
    const h = el as any;
    const aria = h.getAttribute("aria-label") || h.getAttribute("title") || "";
    if (aria) return clean(aria);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const id = el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      const l = (id && (id as any).innerText) || (el.closest("label") as any)?.innerText || (el as any).placeholder || el.name || "";
      return clean(l);
    }
    return clean(h.innerText || h.textContent || "").slice(0, 120);
  };
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="tab"], [role="menuitem"], [contenteditable="true"], summary';
  let n = 0;
  document.querySelectorAll("[data-ducter-ref]").forEach((e: any) => e.removeAttribute("data-ducter-ref"));
  const lines: string[] = [];
  const seen = new Set<any>();
  const walk = (node: any) => {
    if (lines.length >= maxLines) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const t = clean(node.textContent || "");
      const parent = node.parentElement;
      if (t && parent && !parent.closest(INTERACTIVE) && visible(parent)) lines.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as any;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "template", "svg", "head"].includes(tag)) return;
    if (el.matches(INTERACTIVE) && !seen.has(el)) {
      seen.add(el);
      if (!visible(el)) return;
      const ref = ++n;
      el.setAttribute("data-ducter-ref", String(ref));
      const role = el.getAttribute("role");
      let kind = role || tag;
      let extra = "";
      if (el instanceof HTMLInputElement) {
        kind = el.type === "submit" || el.type === "button" ? "button" : `${el.type || "text"} field`;
        if (SECRET(el)) {
          kind = el.type === "password" ? "password field" : "one-time-code field";
          extra = " (the user's to fill: ask them to sign in)";
        } else if (el.type === "checkbox" || el.type === "radio") extra = el.checked ? " (checked)" : " (not checked)";
        else if (el.value) extra = ` = "${clean(el.value).slice(0, 80)}"`;
      } else if (el instanceof HTMLTextAreaElement) {
        kind = "text area";
        if (el.value) extra = ` = "${clean(el.value).slice(0, 80)}"`;
      } else if (el instanceof HTMLSelectElement) {
        kind = "select";
        extra = ` = "${clean(el.selectedOptions[0]?.text ?? "")}"`;
      } else if (tag === "a") {
        kind = "link";
        const href = (el as any).href;
        if (href && !href.startsWith("javascript:")) extra = ` -> ${href.slice(0, 200)}`;
      }
      const text = el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button") ? clean(el.value) : label(el);
      lines.push(`[${ref}] ${kind}${text ? ` "${text}"` : ""}${extra}`);
      return;
    }
    if (!visible(el) && el !== document.body) return;
    const block = /^(p|div|li|h[1-6]|tr|section|article|header|footer|br|dt|dd|td|th)$/.test(tag);
    if (/^h[1-6]$/.test(tag)) {
      const t = clean((el as any).innerText || "");
      if (t && !el.querySelector(INTERACTIVE)) {
        lines.push(`${"#".repeat(Number(tag[1]))} ${t}`);
        return;
      }
    }
    for (const c of Array.from(el.childNodes as ArrayLike<any>)) walk(c);
    if (block && lines.length && lines[lines.length - 1] !== "") lines.push("");
  };
  if (document.body) walk(document.body);
  const out: string[] = [];
  for (const l of lines) if (!(l === "" && out[out.length - 1] === "")) out.push(l);
  return { title: document.title, url: location.href, lines: out, refs: n, more: lines.length >= maxLines };
}

/** The expression for Runtime.evaluate (returnByValue). */
export function readExpression(maxLines = 600): string {
  return `(${readPage.toString()})(${maxLines})`;
}

/** Where an element is now (scrolled into view first), and whether it is a secret field. */
export function locateExpression(ref: number): string {
  return `(() => {
    const el = document.querySelector('[data-ducter-ref="${ref}"]');
    if (!el) return null;
    el.scrollIntoView({ block: "center", inline: "center" });
    const r = el.getBoundingClientRect();
    const ac = ((el.autocomplete || "") + "").toLowerCase();
    const secret = el instanceof HTMLInputElement && (el.type === "password" || ac.includes("one-time-code") || ac.includes("current-password") || ac.includes("new-password") || /otp|2fa|totp|passcode/i.test(el.name + " " + el.id));
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, secret, field, tag: el.tagName.toLowerCase(), type: el.type || "" };
  })()`;
}

/** Focus a field and select what is in it (so typing replaces it). */
export function focusExpression(ref: number, clear: boolean): string {
  return `(() => {
    const el = document.querySelector('[data-ducter-ref="${ref}"]');
    if (!el) return false;
    el.focus();
    if (${clear}) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.select();
      else if (el.isContentEditable) document.execCommand("selectAll");
    }
    return true;
  })()`;
}

/** Narrow a read to lines near the words asked for (a few lines either side). */
export function narrow(lines: string[], query: string | undefined, around = 3): string[] {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return lines;
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    const low = l.toLowerCase();
    if (words.some((w) => low.includes(w))) for (let j = Math.max(0, i - around); j <= Math.min(lines.length - 1, i + around); j++) keep.add(j);
  });
  if (!keep.size) return [`(nothing on the page matches "${query}"; read again without a query)`];
  const out: string[] = [];
  let last = -2;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i > last + 1 && out.length) out.push("…");
    out.push(lines[i]!);
    last = i;
  }
  return out;
}
