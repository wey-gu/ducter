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
import { DEFAULT_PARTNER, FIGURE_LOOK, LOOK_CLAY, PARTNER_ABOUT_MAX, PARTNER_FIGURES, PARTNER_LOOKS, PARTNER_NAME_MAX, lookForFigure, nextFigure, type PartnerFigure, type PartnerInfo, type PartnerLook } from "@ducter/protocol/src/partners.ts";
import type { Brain, HarnessId, PartnerAsk } from "@ducter/protocol";
import { A, type Wear } from "./app.ts";
import { FIGURE_OPTICAL } from "@ducter/protocol/src/figures-gen.ts";
import { say, Said } from "./set-grid.tsx";
import { Coin } from "./coin.tsx";
import { AddRow, Btn, Chev, CountPebble, Facts, Field, IconBtn } from "./controls.tsx";
import { phoneNow } from "./wide.ts";
import { currentSplit } from "./fold.ts";
import { harnessName, modelName } from "./format.ts";
import { Select } from "./menu.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

// D565: each figure's optical size (tools/art/figures.py's one table): every figure is fitted into the
// same square and stands on its feet (app.css .stone, .avatar, .sface), then is scaled by this about its
// feet, so a tall bean and a wide cloud read as the same size as the pebble, wherever a figure shows.
if (typeof document !== "undefined" && !document.querySelector("style[data-figures]")) {
  const st = document.createElement("style");
  st.dataset.figures = "";
  st.textContent = Object.entries(FIGURE_OPTICAL)
    .map(([f, o]) => `img[src*="art/fig/${f}_"], img[src*="art/fig/${f}-"] { scale: ${o}; transform-origin: 50% 100%; }`)
    .join("\n");
  document.head.append(st);
}

/** D536: the models the home offers an agent to think with (settings.brainOptions, else brainNow's own). */
function brainModels(harness: string) {
  return A.brainOptions?.find((o) => o.harness === harness)?.models ?? (A.brainNow?.harness === harness ? A.brainNow.models : []);
}

/** D536: what a partner thinks with as set: its own, else none (it follows the default's). The default's is brainNow. */
function thinksOf(p: PartnerInfo): Brain | undefined {
  if (p.id === DEFAULT_PARTNER) return A.brainNow ?? A.settings?.brain;
  return p.brain;
}

/** D536: the line under a partner's name: its agent's coin, the agent, its model and effort, each its own fact; else the same as the default's. */
function ThinksLine({ p }: { p: PartnerInfo }) {
  const b = thinksOf(p);
  if (!b) return <small class="partner-thinks same">{t("partners.thinks.same", A.defaultName())}</small>;
  const m = b.model ? (brainModels(b.harness).find((x) => x.id === b.model)?.label ?? modelName(b.model)) : undefined;
  return (
    <small class="partner-thinks">
      <Coin harness={b.harness} size={18} />
      <Facts items={[t("partners.thinks.with", harnessName(b.harness)), m, b.effort ? t("partners.thinks.effort", t(`effort.${b.effort}`)) : null, p.id === DEFAULT_PARTNER && (A.partners?.length ?? 0) > 1 ? t("partners.thinks.default") : null]} />
    </small>
  );
}

const SAME = "same";

/** D536: 改一下's 想事情用 for another partner: the same as the default's, or an agent the home has, its model and its effort. A pick applies at once, as a colour does. */
function ThinksPick({ p }: { p: PartnerInfo }) {
  const opts = A.brainOptions ?? [];
  if (!opts.length || p.id === DEFAULT_PARTNER) return null;
  const own = p.brain;
  const agents = [{ v: SAME, label: t("partners.thinks.same.pick", A.defaultName()) }, ...opts.map((o) => ({ v: o.harness as string, label: harnessName(o.harness) }))];
  const models = own ? brainModels(own.harness) : [];
  const model = own ? (models.find((m) => m.id === own.model) ?? models.find((m) => m.default) ?? models[0]) : undefined;
  const efforts = model?.efforts ?? [];
  const set = (b: Brain | null) => A.setPartner(p.id, { brain: b });
  const pickAgent = (v: string) => {
    if (v === SAME) return own && set(null);
    if (own?.harness === v) return;
    const ms = brainModels(v);
    const m = ms.find((x) => x.default) ?? ms[0];
    set({ harness: v as HarnessId, ...(m ? { model: m.id } : {}) });
  };
  return (
    <span class="partner-thinks-pick">
      <span class="pick">
        <span class="small">{t("partners.thinks.title")}</span>
        <Select label={t("partners.thinks.title")} value={own?.harness ?? SAME} options={agents} onPick={pickAgent} />
      </span>
      {own && model && models.length > 1 && (
        <span class="pick">
          <span class="small">{t("loadout.brain.model")}</span>
          <Select label={t("loadout.brain.model")} value={model.id} options={models.map((m) => ({ v: m.id, label: m.label || m.id }))} onPick={(v) => v !== own.model && set({ harness: own.harness, model: v })} />
        </span>
      )}
      {own && model && efforts.length > 0 && (
        <span class="pick">
          <span class="small">{t("newtask.effort")}</span>
          <Select
            label={t("newtask.effort")}
            value={own.effort && efforts.includes(own.effort) ? own.effort : ""}
            options={[{ v: "", label: t("newtask.effort.default") }, ...efforts.map((e) => ({ v: e, label: t(`effort.${e}`) }))]}
            onPick={(v) => set({ harness: own.harness, model: model.id, ...(v ? { effort: v } : {}) })}
          />
        </span>
      )}
    </span>
  );
}

/** D497: a partner's face: the idle clay figure in its own clay (app.css .stone, --clay). The name
 *  "stone" stays for the code (D309's disc); nothing on screen says it. */
export function Stone({ look, size, figure }: { look: PartnerLook; size: number; /** D565 */ figure?: PartnerFigure }) {
  return (
    <span class="stone" data-look={look} style={{ width: size, height: size }} aria-hidden="true">
      <img src={figArt("idle", { figure, look })} alt="" draggable={false} />
    </span>
  );
}

/** D565: a pose's frame of a partner's figure. The pebble's is the art as it always was; the others
 *  are under art/fig/ (tools/art/figures.py), tinted by --clay as the pebble is, except the sprout,
 *  whose frames come ready in each clay so its leaves stay green. No wear: the pebble as drawn. */
export function figArt(pose: string, w?: Wear): string {
  const f = w?.figure;
  if (!f || f === "pebble" || !PARTNER_FIGURES.includes(f)) return `app/art/${pose}.webp`;
  if (f === "sprout" && w?.look && w.look !== "sand") return `app/art/fig/sprout-${w.look}_${pose}.webp`;
  return `app/art/fig/${f}_${pose}.webp`;
}

/** D565: the six figures as a 3 × 2 grid (as on the Mac), each figure standing in
 *  the clay given (a partner's own, so the person sees what they'd get) or in its own suggested clay
 *  (`own`, when a partner is being made); the chosen one ringed and a touch taller. */
function FigurePick({ value, look, onPick, own }: { value: PartnerFigure; look?: PartnerLook; onPick: (f: PartnerFigure) => void; own?: boolean }) {
  return (
    <span class="fig-pick" role="radiogroup" aria-label={t("partners.figure")}>
      {PARTNER_FIGURES.map((f) => {
        const name = t(`partners.figure.${f}`);
        return (
          <button key={f} type="button" class={`fig-chip${f === value ? " on" : ""}`} role="radio" aria-checked={f === value} aria-label={t("partners.figure.label", name, t(`partners.figure.air.${f}`))} onClick={() => onPick(f)}>
            <Stone look={own ? FIGURE_LOOK[f] : (look ?? "sand")} figure={f} size={40} />
            <span class="fig-name">{name}</span>
          </button>
        );
      })}
    </span>
  );
}

/** D565: the moment a partner is made: the six stand on the paper, breathing and blinking out of step,
 *  the chosen one raised; a tap hops it forward, its name and its air beneath. Reduce Motion stills it. */
function Meet({ value, look, onPick }: { value: PartnerFigure; look: PartnerLook; onPick: (f: PartnerFigure) => void }) {
  return (
    <div class="meet">
      <p class="small meet-note">{t("partners.meet")}</p>
      <span class="meet-stage" role="radiogroup" aria-label={t("partners.figure")}>
        {PARTNER_FIGURES.map((f, i) => {
          const on = f === value;
          const clay = on ? look : FIGURE_LOOK[f];
          return (
            <button key={f} type="button" class={`meet-fig${on ? " on" : ""}`} role="radio" aria-checked={on} aria-label={t("partners.figure.label", t(`partners.figure.${f}`), t(`partners.figure.air.${f}`))} onClick={() => onPick(f)}>
              <span class="pl-face" data-look={clay} style={{ "--d": `${-(i * 1.3 + 0.3)}s` } as Record<string, string>}>
                <span key={on ? `${f}-on` : f} class={on ? "meet-hop" : ""}>
                  <span class="stone pl-breathe" aria-hidden="true">
                    <img src={figArt("idle", { figure: f, look: clay })} alt="" draggable={false} />
                    <img class="shut" src={figArt("idle_closed", { figure: f, look: clay })} alt="" draggable={false} />
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </span>
      <p key={value} class="meet-who" aria-live="polite">
        <b>{t(`partners.figure.${value}`)}</b>
        <span>{t(`partners.figure.air.${value}`)}</span>
      </p>
    </div>
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
      <Stone look={p.look} figure={p.figure} size={18} />
    </span>
  );
}

/** D312: another partner's own question, listed in On hand: a tap shows that partner's conversation, where it is answered. */
export function OtherAsk({ a }: { a: PartnerAsk }) {
  const p = A.partners?.find((x) => x.id === a.persona);
  if (!p) return null;
  return (
    <button class="other-ask" data-look={p.look} data-ask={a.decisionId} onClick={() => A.switchPartner(a.persona)} title={t("partners.switch", p.name)}>
      <Stone look={p.look} figure={p.figure} size={32} />
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
          <img src={figArt("idle", p)} alt="" draggable={false} />
          <img class="shut" src={figArt("idle_closed", p)} alt="" draggable={false} />
        </span>
      </span>
      {needs > 0 && <CountPebble n={needs} />}
    </span>
  );
}

/** D513: one partner in the list: its face in its own clay, its name, its last line and the number
 *  of what of its own waits on the person. D517: no tooltip (the name is always there to read). */
function PartnerRowItem({ p, i, shown, face }: { p: PartnerInfo; i: number; shown: string; face: number }) {
  const on = p.id === shown;
  const needs = A.partnerNeeds(p);
  const label = on && needs ? t("door.pebble", p.name, needs) : on ? t("partners.here", p.name) : needs ? t("partners.switch.asks", p.name, needs) : t("partners.switch", p.name);
  return (
    <li>
      <button
        class={on ? "pl-row on" : "pl-row"}
        data-look={p.look}
        aria-current={on ? "true" : undefined}
        aria-label={label}
        onClick={(e) => {
          // D535: the pebble is a door (the next item of this partner's that waits); so is the row
          // of the partner shown while something waits (the keyboard's way to it).
          const pebble = (e.target as HTMLElement | null)?.closest?.(".pl-n");
          if (needs > 0 && (pebble || on)) return void A.openDoor?.(p.id);
          A.openPartner(p.id);
        }}
      >
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
export function PartnerList({ at, places, slim, thin }: { at: "side" | "home"; places?: preact.ComponentChildren; slim?: boolean; thin?: boolean }) {
  if (!A.manyPartners()) return null;
  const shown = A.shownPartner()?.id ?? DEFAULT_PARTNER;
  const at_ = Math.max(0, A.partners!.findIndex((p) => p.id === shown));
  const rows = (
    <ul class="pl-rows" style={{ "--at": at_ } as Record<string, number>}>
      {/* D517: the chosen pebble glides to the row picked, on a spring; the rows never move. */}
      <li class="pl-knob" aria-hidden="true" />
      {A.partners!.map((p, i) => (
        <PartnerRowItem key={p.id} p={p} i={i} shown={shown} face={at === "home" ? 52 : thin ? 30 : 40} />
      ))}
    </ul>
  );
  if (at === "side")
    return (
      <nav class={`pane partners${thin ? " thin" : slim ? " slim" : ""}${Date.now() - A.railAt < 600 ? " rail-in" : ""}`} aria-label={t("partners.title")}>
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

/** D513, D541: a phone's way up to the list from a conversation (and a fold's, where no column
 *  stands beside): ‹ and the other partners' own figures, a small stack in their clays, with the
 *  number of what waits on the person in them. A lone ‹ read as "back"; the faces say who is there. */
export function PartnersBack() {
  if (!A.manyPartners()) return null;
  const shown = A.shownPartner()?.id ?? DEFAULT_PARTNER;
  const others = A.partners!.filter((p) => p.id !== shown);
  const elsewhere = others.reduce((n, p) => n + A.partnerNeeds(p), 0);
  const label = elsewhere ? t("partners.back.asks", elsewhere) : t("partners.back");
  return (
    <button class="partners-back" aria-label={label} onClick={() => (A.railMode === "hidden" && !phoneNow() && !currentSplit() ? A.setRail("") : A.showPartners())}>
      <Chev back cls="pb-chev" />
      <span class="pb-faces" aria-hidden="true">
        {others.slice(0, 3).map((p) => (
          <span key={p.id} class="pb-face stone" data-look={p.look}>
            <img src={figArt("idle", p)} alt="" draggable={false} />
          </span>
        ))}
        {elsewhere > 0 && <CountPebble n={elsewhere} />}
      </span>
    </button>
  );
}

/** D545: the header's toggle for the list beside the conversation: narrower (the faces alone),
 *  hidden, and back. A drawn glyph alone (the shared IconBtn): a window with its side column, the
 *  column as wide as the list will be after the press. */
export function RailToggle() {
  if (!A.manyPartners()) return null;
  const next = A.nextRail();
  const label = t(next === "thin" ? "partners.rail.thin" : next === "hidden" ? "partners.rail.hide" : "partners.rail.show");
  // The glyph says how the list stands now, in the places' family (an 18-px mark, a 1.6 stroke, the
  // muted ink): the window's outline and the list's edge inside it, wide as the width has it,
  // narrow when thin, dashed when hidden.
  const edge = A.railMode === "thin" ? 5 : 7.5;
  return (
    <span class="rail-toggle">
      <IconBtn label={label} onClick={() => A.setRail(next)}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
          <rect x="2" y="3.5" width="14" height="11" rx="2.5" />
          <path d={`M${edge} 3.5v11`} stroke-dasharray={A.railMode === "hidden" ? "0.6 2.6" : undefined} />
        </svg>
      </IconBtn>
    </span>
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

function LookPick({ value, onPick, label, figure }: { value: PartnerLook; onPick: (l: PartnerLook) => void; label: string; /** D565: the figure each clay is shown on */ figure?: PartnerFigure }) {
  return (
    <span class="look-pick" role="radiogroup" aria-label={label}>
      {PARTNER_LOOKS.map((l) => (
        <button key={l} class={`look-chip${l === value ? " on" : ""}`} role="radio" aria-checked={l === value} aria-label={t(`partners.look.${l}`)} title={t(`partners.look.${l}`)} data-look={l} onClick={() => onPick(l)}>
          <Stone look={l} figure={figure} size={24} />
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
      {p && <Stone look={p.look} figure={p.figure} size={14} />}
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
          <Stone look={p.look} figure={p.figure} size={40} />
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
        <Stone look={p.look} figure={p.figure} size={40} />
        <span class="grow partner-words">
          {editing ? (
            <>
              <Field strong value={draft} maxLength={PARTNER_NAME_MAX} label={t("partners.rename")} autoFocus onInput={setDraft} onKeyDown={keys} />
              <Field value={aboutDraft} maxLength={PARTNER_ABOUT_MAX} label={t("partners.about")} placeholder={t("partners.about.placeholder")} onInput={setAboutDraft} onKeyDown={keys} />
            </>
          ) : (
            <>
              <b>{p.name}</b>
              {p.about ? <small class="partner-about">{t("partners.about.shown", p.about)}</small> : null}
              <ThinksLine p={p} />
            </>
          )}
          {shown ? <small>{t("partners.talking")}</small> : null}
        </span>
      </span>
      {/* D565: its figure above its colours, free to change any time; it says one line in its new shape. */}
      <FigurePick
        value={p.figure ?? "pebble"}
        look={p.look}
        onPick={(figure) => {
          if (figure === (p.figure ?? "pebble")) return;
          A.setPartner(p.id, { figure });
          say(`fig:${p.id}`, t("said.figure", t(`partners.figure.${figure}`)), "fig:", { src: figArt("idle", { figure, look: p.look }), look: p.look });
        }}
      />
      <Said k={`fig:${p.id}`} />
      <LookPick value={p.look} figure={p.figure} label={t("partners.look")} onPick={(look) => A.setPartner(p.id, { look })} />
      {editing && <ThinksPick p={p} />}
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
  // D565: the first figure nobody has, in its own clay unless taken; a picked figure brings its own
  // clay along until the person picks a colour themselves.
  const taken = A.partners ?? [];
  const [figure, setFigure] = useState<PartnerFigure>(() => nextFigure(taken.map((p) => p.figure ?? "pebble")));
  const [look, setLook] = useState<PartnerLook>(() => lookForFigure(figure, taken.map((p) => p.look)));
  const [ownLook, setOwnLook] = useState(false);
  const pickFigure = (f: PartnerFigure) => {
    setFigure(f);
    if (!ownLook) setLook(lookForFigure(f, taken.map((p) => p.look)));
  };
  const ask = A.partnerAsk?.kind === "add" ? A.partnerAsk : undefined;
  const go = () => {
    A.addPartner(name, look, about, figure);
    setName("");
    setAbout("");
  };
  const addKeys = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.isComposing) go();
    if (e.key === "Escape") e.stopPropagation(), done();
  };
  return (
    <div class="set-item partner-add">
      <Meet value={figure} look={look} onPick={pickFigure} />
      <span class="partner-add-head">
        <label class="acct-field grow">
          <span class="small">{t("partners.add.name")}</span>
          <Field value={name} label={t("partners.add.name")} maxLength={PARTNER_NAME_MAX} placeholder={t("partners.add.placeholder")} autoFocus onInput={setName} onKeyDown={addKeys} />
        </label>
      </span>
      <label class="acct-field">
        <span class="small">{t("partners.about")}</span>
        <Field value={about} label={t("partners.about")} maxLength={PARTNER_ABOUT_MAX} placeholder={t("partners.about.placeholder")} onInput={setAbout} onKeyDown={addKeys} />
      </label>
      <span class="small">{t("partners.look")}</span>
      <LookPick value={look} figure={figure} label={t("partners.look")} onPick={(l) => (setLook(l), setOwnLook(true))} />
      {ask?.error && (
        <p class="small partner-error" role="alert">
          {errorWord(ask.error)}
        </p>
      )}
      <div class="btns">
        <Btn kind="primary" label={t("partners.add.go")} disabled={!name.trim()} onClick={go} />
        <Btn kind="text" label={t("partners.add.cancel")} onClick={done} />
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
