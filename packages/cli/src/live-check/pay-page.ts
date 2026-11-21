// D463, for D436/D446's owed "pay words on real checkouts": a checkout page the person saved
// (File › Save Page As at the pay step, nothing pressed), read without a browser. Each control a
// press could land on is named the way reader.ts's PAY_FACTS names it in the live page (its words,
// every other name, whether it submits a form, the form's address, a card in the form), and judged
// by the gate's own paysAt. A static read: what a script adds later is not in the file.
import { paysAt, type PayFacts } from "@ducter/core/src/browser/tools.ts";

export interface PageControl {
  tag: string;
  type: string;
  label: string;
  pay: PayFacts;
}

const CARD_FIELD = /card.?num|cc.?num|cardnumber|cvc|cvv|csc|security.?code/i;
const clean = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 80);

interface Open {
  c: PageControl;
  text: string;
}
interface Form {
  action: string;
  card: boolean;
  controls: PageControl[];
}

/** The controls in a saved page, as the gate would see them. */
export async function controlsIn(html: string): Promise<PageControl[]> {
  const out: PageControl[] = [];
  const open: Open[] = [];
  const forms: Form[] = [];
  let hidden = 0; // inside script/style/template
  const add = (c: PageControl, words: (string | null)[]) => {
    for (const w of words) {
      const s = clean(w ?? "");
      if (s && !c.pay.words!.includes(s) && c.pay.words!.length < 12) c.pay.words!.push(s);
    }
  };
  const control = (tag: string, type: string, el: { getAttribute(n: string): string | null }, submits: boolean) => {
    const form = forms.at(-1);
    const submit = submits && !!form;
    const c: PageControl = { tag, type, label: "", pay: { words: [], submit, ...(submit ? { action: clean(el.getAttribute("formaction") ?? form!.action) } : {}) } };
    add(c, [el.getAttribute("aria-label"), el.getAttribute("value"), el.getAttribute("title"), el.getAttribute("alt")]);
    if (form) form.controls.push(c);
    out.push(c);
    return c;
  };
  const rw = new HTMLRewriter()
    .on("script, style, template, noscript", {
      element(el) {
        hidden++;
        el.onEndTag(() => void hidden--);
      },
    })
    .on("form", {
      element(el) {
        const f: Form = { action: el.getAttribute("action") ?? "", card: false, controls: [] };
        forms.push(f);
        el.onEndTag(() => {
          forms.pop();
          for (const c of f.controls) if (c.pay.submit) c.pay.cardForm = f.card;
        });
      },
    })
    .on("input", {
      element(el) {
        const form = forms.at(-1);
        const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
        if (form && (ac.includes("cc-number") || ac.includes("cc-csc") || CARD_FIELD.test(`${el.getAttribute("name") ?? ""} ${el.getAttribute("id") ?? ""}`))) form.card = true;
        const type = (el.getAttribute("type") ?? "text").toLowerCase();
        if (!/^(submit|button|image)$/.test(type)) return;
        const c = control("input", type, el, type !== "button");
        c.label = c.pay.words![0] ?? "";
      },
    })
    .on("button, a, [role=button]", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input") return;
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        const c = control(tag, type, el, tag === "button" && (!type || type === "submit"));
        const aria = clean(el.getAttribute("aria-label") ?? "");
        const o: Open = { c, text: "" };
        open.push(o);
        el.onEndTag(() => {
          const i = open.indexOf(o);
          if (i >= 0) open.splice(i, 1);
          const text = clean(o.text);
          if (text) add(c, [text]);
          // As the live reader labels it: aria-label, else its text, else any other name.
          c.label = aria || text || c.pay.words![0] || "";
        });
      },
    })
    .on("[aria-label], [title], img[alt]", {
      element(el) {
        if (!open.length) return;
        const tag = el.tagName.toLowerCase();
        if (tag === "button" || tag === "a" || el.getAttribute("role") === "button") return;
        for (const o of open) add(o.c, [el.getAttribute("aria-label"), el.getAttribute("title"), el.getAttribute("alt")]);
      },
    })
    .onDocument({
      text(t) {
        if (hidden || !open.length) return;
        for (const o of open) o.text += t.text;
      },
    });
  await rw.transform(new Response(html)).text();
  return out;
}

/** The controls a press on which the gate refuses, by their first name. */
export async function payControls(html: string): Promise<{ controls: number; pays: string[] }> {
  const all = await controlsIn(html);
  const pays = all.filter((c) => paysAt({ label: c.label, tag: c.tag, type: c.type, pay: c.pay }));
  return { controls: all.length, pays: pays.map((c) => c.label || c.pay.action || `(${c.tag} with no words)`) };
}
