// D663: 找设置 / Find a setting on the web and phone. The field under Settings' title; typing
// shows the settings it finds (never panes) as the list's own rows: the pane's clay, the setting's
// words, the pane it lives in as its own element, its value at the right edge, the chevron.
// Choosing one opens the pane landed on that row: scrolled to it, briefly lit (the conversation's
// find tint; reduced motion: the tint without the fade), the focus on its control. Nothing found
// is one calm line in the partner's voice and the way to say it in the conversation. ⌘F in
// Settings comes here. The words stay while a found pane is open, so ‹ 设置 comes back to them.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { A, type SettingsPage } from "./app.ts";
import { Btn, Chev, FindField, OptionRow } from "./controls.tsx";
import { keepClauses } from "./format.ts";
import { entryPane, entryTitle, jumpTo, setFind, SFState, norm, type SetHit } from "./setfind.ts";
import { Avatar } from "./views.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The words in the field and the row the keys are on; kept while a found pane is open. */
export const SF: { q: string; at: number; focus: boolean } = { q: "", at: 0, focus: false };

const coarse = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
const still = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The field, under Settings' title. */
export function SetFindBox() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!SF.focus) return;
    SF.focus = false;
    ref.current?.focus();
    ref.current?.select();
  });
  const hits = SF.q.trim() ? setFind(SF.q) : [];
  const set = (q: string) => ((SF.q = q), (SF.at = 0), A.changed());
  return (
    <FindField
      class="set-find"
      id="set-find"
      inputRef={ref}
      value={SF.q}
      label={t("setfind.field")}
      onInput={set}
      onKeyDown={(e) => {
        if (!hits.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          SF.at = (SF.at + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % hits.length;
          A.changed();
        }
        if (e.key === "Enter" && !e.isComposing) e.preventDefault(), jumpTo(hits[Math.min(SF.at, hits.length - 1)]!.e);
      }}
    />
  );
}

/** What the words find, in place of the brief and the list. */
export function SetFindResults({ art }: { art: (page: Exclude<SettingsPage, "">) => ComponentChildren }) {
  const q = SF.q.trim();
  const hits = setFind(q);
  if (!hits.length) return <SetNone q={q} />;
  const at = Math.min(SF.at, hits.length - 1);
  return (
    <>
      <p class="sf-count" aria-live="polite">
        {hits.length === 1 ? t("setfind.found.one") : t("setfind.found", hits.length)}
      </p>
      <div class="set-card set-list sf-list" role="listbox" aria-label={t("setfind.field")}>
        {hits.map((h, i) => (
          <SetHitRow key={h.e.id} h={h} at={i === at} art={art(h.e.page)} onHover={() => i !== SF.at && ((SF.at = i), A.changed())} />
        ))}
      </div>
    </>
  );
}

function SetHitRow({ h, at, art, onHover }: { h: SetHit; at: boolean; art: ComponentChildren; onHover: () => void }) {
  const value = h.e.value?.() ?? "";
  return (
    <OptionRow class="set-row sf-row" at={at} onClick={() => jumpTo(h.e)} onHover={onHover}>
      <span class="sf-art">{art}</span>
      <span class="grow">
        <b>{keepClauses(entryTitle(h.e))}</b>
        {/* The pane apart; never said twice when the setting is the pane's own name (通知 in 通知). */}
        {entryPane(h.e) !== entryTitle(h.e) && <small class="sf-pane">{entryPane(h.e)}</small>}
      </span>
      {value && <span class="sf-value">{value}</span>}
      <Chev />
    </OptionRow>
  );
}

/** Nothing found: one calm line, and the conversation, where the partner can change it by talk. */
function SetNone({ q }: { q: string }) {
  const name = A.speakerFor().name;
  return (
    <div class="sf-none" role="status">
      <Avatar size={36} state="idle" />
      <div class="sf-none-words">
        <p class="sf-none-say">{t("setfind.none", q)}</p>
        <p class="sf-none-ask">{t("setfind.none.ask")}</p>
        <Btn kind="secondary" size="sm" label={t("setfind.none.go", name)} onClick={() => ((SF.q = ""), A.askAboutMe(q))} />
      </div>
    </div>
  );
}

/** ⌘F (Ctrl+F) anywhere in Settings: the list, the field focused, the words kept. */
export function setFindKey(e: KeyboardEvent, go: (p: SettingsPage) => void): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return false;
  e.preventDefault();
  SF.focus = true;
  go("");
  return true;
}

/** The rows a heading or a title may stand for: the row itself, or a heading's whole group. */
const ROW = ".chat-row, .chat-head, .set-item, label.switch, .switch-how, .quiet-range, .set-row, .partner-head, .trust, section.chat-app";

/** The row on this pane that draws one of the words, the row's own words first. */
export function findRow(root: ParentNode, texts: string[]): HTMLElement | null {
  const nodes: { el: HTMLElement; text: string }[] = [];
  const walk = document.createTreeWalker(root as Node, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (el && n.textContent?.trim()) nodes.push({ el, text: norm(n.textContent) });
  }
  for (const want of texts) {
    const labelled = [...(root as Element).querySelectorAll<HTMLElement>("[aria-label]")].find((x) => norm(x.getAttribute("aria-label") ?? "") === want && x.matches("section"));
    if (labelled) return labelled;
    const hit = nodes.find((x) => x.text === want);
    if (!hit) continue;
    if (hit.el.matches("h3")) {
      // A group's heading: the group's card under it.
      const card = hit.el.parentElement?.querySelector<HTMLElement>(":scope > .set-card");
      return card ?? hit.el;
    }
    return hit.el.closest<HTMLElement>(ROW) ?? hit.el;
  }
  return null;
}

/** The control in a row the focus goes to: never a text field under a finger (D578). */
function controlIn(row: HTMLElement): HTMLElement | null {
  const all = [...row.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, button, [tabindex]:not([tabindex='-1'])")].filter((x) => !(x as HTMLButtonElement).disabled);
  return all.find((x) => !(coarse() && x.matches("input[type=text], input[type=search], input:not([type]), textarea"))) ?? null;
}

/** Lands a jump on its row once the pane has drawn it (a pane still reading waits up to 4 s). */
export function SetLanding({ page }: { page: SettingsPage }) {
  useEffect(() => {
    const land = SFState.land;
    if (!land || land.page !== page) return;
    let tries = 0;
    let lit: HTMLElement | null = null;
    let off: ReturnType<typeof setTimeout> | undefined;
    const tick = setInterval(() => {
      const root = document.querySelector(`.set-page.pushed[data-page="${page}"]`);
      // The row's own words arrive with the pane's data; its group's heading is the landing only
      // once the row has had a second to come (quiet hours while notifications are off).
      const row = root && (findRow(root, land.own) ?? (tries > 12 && land.near ? findRow(root, [land.near]) : null));
      if (row) {
        clearInterval(tick);
        SFState.land = undefined;
        row.scrollIntoView({ block: "center", behavior: still() ? "auto" : "smooth" });
        row.classList.remove("sf-found");
        void row.offsetWidth;
        row.classList.add("sf-found");
        lit = row;
        controlIn(row)?.focus({ preventScroll: true });
        off = setTimeout(() => lit?.classList.remove("sf-found"), 2400);
      } else if (++tries > 50) {
        clearInterval(tick);
        SFState.land = undefined;
      }
    }, 80);
    return () => {
      clearInterval(tick);
      if (off) clearTimeout(off);
    };
  }, [page]);
  return null;
}
