// D309: 伙伴们 / Your partners (design/personas.md), the same as the Mac's
// (apps/desktop/internal/views/partners.go). With one partner nothing here shows: no word, no
// face, no switch. D497: with more, each partner is the same clay figure in its own clay (its look,
// LOOK_CLAY), the conversation's own figure in the shown one's; the others sit beside it in the bar,
// each its face and its name, with the number of what of its own waits on the person, and a tap
// (or ⌥⌘1–⌥⌘4, or Find anything) shows its conversation. D513: the pills gave way to a list, as a
// messaging app has (PartnerList): a column at the conversation's left when wide, the level above
// the conversation on a phone. Settings › 伙伴 lists them, renames them, changes a look and
// adds one (a name, what it looks after and a colour). D486: what each looks after shows under its
// name and is changed with it; another partner is removed in two taps (its conversation stays).
// A partner can also be made, renamed or handed the person's words from the conversation.
import { useState } from "preact/hooks";
import { DEFAULT_PARTNER, LOOK_CLAY, PARTNER_ABOUT_MAX, PARTNER_LOOKS, PARTNER_NAME_MAX, nextLook, type PartnerInfo, type PartnerLook } from "@ducter/protocol/src/partners.ts";
import type { PartnerAsk } from "@ducter/protocol";
import { A } from "./app.ts";
import { AddRow, Btn, Chev } from "./controls.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** D497: a partner's face: the idle clay figure in its own clay (app.css .stone, --clay). The name
 *  "stone" stays for the code (D309's disc); nothing on screen says it. */
export function Stone({ look, size }: { look: PartnerLook; size: number }) {
  return (
    <span class="stone" data-look={look} style={{ width: size, height: size }} aria-hidden="true">
      <img src="app/art/idle.webp" alt="" draggable={false} />
    </span>
  );
}

/** D497: the CSS filter a look gives the clay figure, from the protocol's one table. */
export function clayFilter(look: PartnerLook | undefined): string {
  const c = look ? LOOK_CLAY[look] : undefined;
  return !c || (c.hue === 0 && c.sat === 1) ? "none" : `hue-rotate(${c.hue}deg) saturate(${c.sat})`;
}

/** D312: whose a task is, on its On hand row or card, once there is more than one partner. */
export function PartnerMark({ persona }: { persona: string | undefined }) {
  if (!A.manyPartners()) return null;
  const p = A.partners!.find((x) => x.id === persona) ?? A.partners!.find((x) => x.id === DEFAULT_PARTNER);
  if (!p) return null;
  return (
    <span class="partner-mark" role="img" aria-label={p.name} title={p.name}>
      <Stone look={p.look} size={18} />
    </span>
  );
}

/** D312: another partner's own question, listed in On hand: a tap shows that partner's conversation, where it is answered. */
export function OtherAsk({ a }: { a: PartnerAsk }) {
  const p = A.partners?.find((x) => x.id === a.persona);
  if (!p) return null;
  return (
    <button class="other-ask" data-look={p.look} onClick={() => A.switchPartner(a.persona)} title={t("partners.switch", p.name)}>
      <Stone look={p.look} size={32} />
      <span class="ask-words">
        <span class="who">{t("partners.asks.from", p.name)}</span>
        <span class="q">{a.question}</span>
      </span>
      <Chev cls="go" />
    </button>
  );
}

/** D513: what a partner's row says under its name: the last thing said in its conversation (the
 *  person's own words marked as theirs), else what it looks after, else that nothing was said. */
function lastWords(p: PartnerInfo): string {
  if (p.last) return p.last.you ? t("partners.you", p.last.text) : p.last.text;
  return p.about ? t("partners.about.shown", p.about) : t("partners.empty");
}

/** D517: what each partner last brought, and when its figure last hopped for something new. */
const hops = new Map<string, { key: string; n: number; at: number }>();

/** D517: a partner's figure hops once when something new comes from it (a new line of its own or a new
 *  thing waiting): never on the first look, never for the one shown, never while a switch settles. */
function hopOf(p: PartnerInfo, needs: number, shown: string): number {
  const key = `${needs}|${p.last && !p.last.you ? p.last.at : ""}`;
  const was = hops.get(p.id);
  if (!was) return hops.set(p.id, { key, n: 0, at: 0 }), 0;
  if (was.key !== key) {
    was.key = key;
    if (p.id !== shown && A.S.welcomed && Date.now() - A.partnerSwitchedAt > 2000) (was.n += 1), (was.at = Date.now());
  }
  return was.n;
}

/** D517: a partner's figure in the list, in its own clay: it breathes and blinks out of step with the
 *  others (app.css .pl-breathe, .shut), hops when something new comes, and carries its number as a
 *  clay pebble. Still under Reduce Motion. */
function RailFace({ p, i, size, needs, hop }: { p: PartnerInfo; i: number; size: number; needs: number; hop: number }) {
  return (
    <span class="pl-face" data-look={p.look} style={{ "--d": `${-(i * 1.7 + 0.4)}s` } as Record<string, string>}>
      <span key={hop} class={hop ? "pl-hop on" : "pl-hop"}>
        <span class="stone pl-breathe" style={{ width: size, height: size }} aria-hidden="true">
          <img src="app/art/idle.webp" alt="" draggable={false} />
          <img class="shut" src="app/art/idle_closed.webp" alt="" draggable={false} />
        </span>
      </span>
      {needs > 0 && (
        <span class="pl-n" aria-hidden="true">
          {needs}
        </span>
      )}
    </span>
  );
}

/** D513: one partner in the list: its face in its own clay, its name, its last line and the number
 *  of what of its own waits on the person. D517: no tooltip (the name is always there to read). */
function PartnerRowItem({ p, i, shown, face }: { p: PartnerInfo; i: number; shown: string; face: number }) {
  const on = p.id === shown;
  const needs = A.partnerNeeds(p);
  const label = on ? t("partners.here", p.name) : needs ? t("partners.switch.asks", p.name, needs) : t("partners.switch", p.name);
  return (
    <li>
      <button class={on ? "pl-row on" : "pl-row"} data-look={p.look} aria-current={on ? "true" : undefined} aria-label={label} onClick={() => A.openPartner(p.id)}>
        <RailFace p={p} i={i} size={face} needs={needs} hop={hopOf(p, needs, shown)} />
        <span class="pl-words" aria-hidden="true">
          <span class="pl-name">{p.name}</span>
          <span class="pl-last">{lastWords(p)}</span>
        </span>
      </button>
    </li>
  );
}

/** D513: 伙伴们 / Your partners as a messaging app lists its chats, once there is more than one.
 *  Wide (`side`), a column at the conversation's left: each row its face, name, last line and
 *  number; a narrower window keeps the faces and numbers (app.css). On a phone (`home`), the
 *  level above the conversation: the list, a tap in, back with ‹ or the edge swipe. */
export function PartnerList({ at, places }: { at: "side" | "home"; places?: preact.ComponentChildren }) {
  if (!A.manyPartners()) return null;
  const shown = A.shownPartner()?.id ?? DEFAULT_PARTNER;
  const at_ = Math.max(0, A.partners!.findIndex((p) => p.id === shown));
  const rows = (
    <ul class="pl-rows" style={{ "--at": at_ } as Record<string, number>}>
      {/* D517: the chosen pebble glides to the row picked, on a spring; the rows never move. */}
      <li class="pl-knob" aria-hidden="true" />
      {A.partners!.map((p, i) => (
        <PartnerRowItem key={p.id} p={p} i={i} shown={shown} face={at === "home" ? 52 : 40} />
      ))}
    </ul>
  );
  if (at === "side")
    return (
      <nav class="pane partners" aria-label={t("partners.title")}>
        <header class="top">
          <h1 class="level">{t("partners.title")}</h1>
        </header>
        {rows}
      </nav>
    );
  return (
    <>
      <header class="top">
        <h1 class="level">{t("partners.title")}</h1>
        <span style={{ flex: 1 }} />
        {places}
      </header>
      <main class="scroll partners-home" aria-label={t("partners.title")}>
        {rows}
        {A.partners!.length < 4 && (
          <div class="set-card pl-add">
            <AddRow label={t("partners.add")} help={t("partners.add.help")} onClick={() => A.openSettings("partner")} />
          </div>
        )}
      </main>
    </>
  );
}

/** D513: a phone's way up to the list from a conversation: ‹ with the number of what waits on the
 *  person in the other partners (a messaging app's back button with its unread count). */
export function PartnersBack() {
  if (!A.manyPartners()) return null;
  const shown = A.shownPartner()?.id ?? DEFAULT_PARTNER;
  const elsewhere = A.partners!.filter((p) => p.id !== shown).reduce((n, p) => n + A.partnerNeeds(p), 0);
  const label = elsewhere ? t("partners.back.asks", elsewhere) : t("partners.back");
  return (
    <button class="partners-back" aria-label={label} onClick={() => A.showPartners()}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path d="M11 4L6 9l5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {elsewhere > 0 && (
        <span class="pl-n" aria-hidden="true">
          {elsewhere}
        </span>
      )}
    </button>
  );
}

/** D497: ⌥⌘1–⌥⌘4 show the first to fourth partner, in Settings' order (the default first). */
export function partnerKey(e: KeyboardEvent) {
  if (!A.manyPartners() || !(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey) return;
  const n = /^Digit([1-4])$/.exec(e.code)?.[1];
  const p = n ? A.partners![Number(n) - 1] : undefined;
  if (!p) return;
  e.preventDefault();
  A.switchPartner(p.id);
}

const errorWord = (e: string | undefined) => (e ? t(`partners.error.${e}`) : "");

function LookPick({ value, onPick, label }: { value: PartnerLook; onPick: (l: PartnerLook) => void; label: string }) {
  return (
    <span class="look-pick" role="radiogroup" aria-label={label}>
      {PARTNER_LOOKS.map((l) => (
        <button key={l} class={`look-chip${l === value ? " on" : ""}`} role="radio" aria-checked={l === value} aria-label={t(`partners.look.${l}`)} title={t(`partners.look.${l}`)} data-look={l} onClick={() => onPick(l)}>
          <Stone look={l} size={24} />
        </button>
      ))}
    </span>
  );
}

/** D486: the person's words for another partner, passed on by the one they said them to: who passed them (a tap shows that one). */
export function PassedFrom({ from }: { from: string }) {
  const p = A.partners?.find((x) => x.id === from);
  return (
    <button type="button" class="user-app-from passed-from" disabled={!p} onClick={() => p && A.switchPartner(p.id)} title={p ? t("partners.switch", p.name) : undefined}>
      {p && <Stone look={p.look} size={14} />}
      <span>{p ? t("partners.passed", p.name) : t("partners.passed.gone")}</span>
    </button>
  );
}

function PartnerRow({ p }: { p: PartnerInfo }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [draft, setDraft] = useState("");
  const [aboutDraft, setAboutDraft] = useState("");
  const shown = (A.shownPartner()?.id ?? DEFAULT_PARTNER) === p.id;
  const save = () => {
    const n = draft.trim();
    const a = aboutDraft.trim();
    const patch = { ...(n && n !== p.name ? { name: n } : {}), ...(a !== (p.about ?? "") ? { about: a } : {}) };
    if (Object.keys(patch).length) A.setPartner(p.id, patch);
    setEditing(false);
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.isComposing) save();
    if (e.key === "Escape") e.stopPropagation(), setEditing(false);
  };
  // D513: a row is three lines, never one: who (the figure, the name, what it looks after), its
  // colours, then its actions. On one line the buttons took the width and the words were squeezed
  // to a strip one character wide on a phone.
  if (removing)
    return (
      <div class="set-row partner-row partner-removing" role="group" aria-label={t("partners.remove.ask", p.name)}>
        <span class="partner-top">
          <Stone look={p.look} size={40} />
          <span class="grow partner-words">
            <b>{t("partners.remove.ask", p.name)}</b>
            <small>{t("partners.remove.what", A.defaultName())}</small>
          </span>
        </span>
        <span class="partner-acts">
          <Btn kind="text" size="sm" label={t("partners.remove.keep")} onClick={() => setRemoving(false)} />
          <Btn kind="secondary" size="sm" label={t("partners.remove.go")} about={p.name} onClick={() => (setRemoving(false), A.removePartner(p.id))} />
        </span>
      </div>
    );
  return (
    <div class="set-row partner-row">
      <span class="partner-top">
        <Stone look={p.look} size={40} />
        <span class="grow partner-words">
          {editing ? (
            <>
              <input class="name-input" value={draft} maxLength={PARTNER_NAME_MAX} aria-label={t("partners.rename")} autoFocus onInput={(e) => setDraft((e.target as HTMLInputElement).value)} onKeyDown={keys} />
              <input class="name-input about-input" value={aboutDraft} maxLength={PARTNER_ABOUT_MAX} aria-label={t("partners.about")} placeholder={t("partners.about.placeholder")} onInput={(e) => setAboutDraft((e.target as HTMLInputElement).value)} onKeyDown={keys} />
            </>
          ) : (
            <>
              <b>{p.name}</b>
              {p.about ? <small class="partner-about">{t("partners.about.shown", p.about)}</small> : null}
            </>
          )}
          {shown ? <small>{t("partners.talking")}</small> : null}
        </span>
      </span>
      <LookPick value={p.look} label={t("partners.look")} onPick={(look) => A.setPartner(p.id, { look })} />
      <span class="partner-acts">
        {editing ? (
          <Btn kind="primary" size="sm" label={t("partners.rename.save")} onClick={save} />
        ) : (
          <>
            {!shown && <Btn kind="secondary" size="sm" label={t("partners.switch", p.name)} onClick={() => A.openPartner(p.id)} />}
            <Btn kind="text" size="sm" label={t("partners.change")} about={p.name} onClick={() => (setDraft(p.name), setAboutDraft(p.about ?? ""), setEditing(true))} />
            {p.id !== DEFAULT_PARTNER && <Btn kind="text" size="sm" label={t("partners.remove")} about={p.name} onClick={() => setRemoving(true)} />}
          </>
        )}
      </span>
    </div>
  );
}

function AddForm({ done }: { done: () => void }) {
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [look, setLook] = useState<PartnerLook>(nextLook((A.partners ?? []).map((p) => p.look)));
  const ask = A.partnerAsk?.kind === "add" ? A.partnerAsk : undefined;
  const go = () => {
    A.addPartner(name, look, about);
    setName("");
    setAbout("");
  };
  return (
    <div class="set-item partner-add">
      <span class="partner-add-head">
        <Stone look={look} size={48} />
        <label class="acct-field grow">
          <span class="small">{t("partners.add.name")}</span>
          <input
            value={name}
            maxLength={PARTNER_NAME_MAX}
            placeholder={t("partners.add.placeholder")}
            autoFocus
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) go();
              if (e.key === "Escape") e.stopPropagation(), done();
            }}
          />
        </label>
      </span>
      <label class="acct-field">
        <span class="small">{t("partners.about")}</span>
        <input
          value={about}
          maxLength={PARTNER_ABOUT_MAX}
          placeholder={t("partners.about.placeholder")}
          onInput={(e) => setAbout((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.isComposing) go();
            if (e.key === "Escape") e.stopPropagation(), done();
          }}
        />
      </label>
      <span class="small">{t("partners.look")}</span>
      <LookPick value={look} label={t("partners.look")} onPick={setLook} />
      {ask?.error && (
        <p class="small partner-error" role="alert">
          {errorWord(ask.error)}
        </p>
      )}
      <div class="btns">
        <Btn kind="text" label={t("partners.add.cancel")} onClick={done} />
        <Btn kind="primary" label={t("partners.add.go")} disabled={!name.trim()} onClick={go} />
      </div>
    </div>
  );
}

/** Settings › 伙伴's 伙伴们 / Your partners: shown only on a home that offers more than one. */
/** D500: with several partners the group leads the page (who is who); with one it is the page's last
 *  group, after everything about the one there is (the fresh user meets it last, personas.md). */
export function PartnersSection({ at }: { at: "top" | "foot" }) {
  const [openedAt, setOpenedAt] = useState(0);
  if (!A.partners) return null;
  const ps = A.partners;
  const full = ps.length >= 4;
  const many = ps.length > 1;
  if ((at === "top") !== many) return null;
  // A partner added since the form opened closes it.
  const open = openedAt > 0 && !(A.partnerAddedAt >= openedAt);
  const setAdding = (on: boolean) => setOpenedAt(on ? Date.now() : 0);
  return (
    <section class="set partners-set">
      <h3>{t("partners.title")}</h3>
      {/* D289: a group's note sits under its heading, never under the card. */}
      <p class="g-note">{many ? t("partners.help") : t("partners.say")}</p>
      <div class="set-card">
        {many && ps.map((p) => <PartnerRow key={p.id} p={p} />)}
        {open ? <AddForm done={() => setAdding(false)} /> : !full && <AddRow label={t("partners.add")} help={t("partners.add.help")} onClick={() => ((A.partnerAsk = undefined), setAdding(true))} />}
      </div>
    </section>
  );
}
