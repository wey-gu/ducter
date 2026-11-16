// D309: 伙伴们 / Your partners (design/personas.md), the same as the Mac's
// (apps/desktop/internal/views/partners.go). With one partner nothing here shows: no word, no
// stone, no switch. With more, the conversation bar's face sits on its partner's own clay stone,
// the others sit beside the name as small stones (a dot when one has something waiting), and a
// tap on one shows its conversation. Settings › 伙伴 lists them, renames them, changes a look and
// adds one (a name and a colour, nothing else).
import { useState } from "preact/hooks";
import { DEFAULT_PARTNER, PARTNER_LOOKS, PARTNER_NAME_MAX, nextLook, type PartnerInfo, type PartnerLook } from "@ducter/protocol/src/partners.ts";
import { A } from "./app.ts";
import { AddRow, Btn } from "./controls.tsx";
const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** A partner's stone: its idle clay face on its own colour (app.css .stone, --look-*). */
export function Stone({ look, size }: { look: PartnerLook; size: number }) {
  return (
    <span class="stone" data-look={look} style={{ width: size, height: size }} aria-hidden="true">
      <img src="app/art/idle.webp" alt="" draggable={false} />
    </span>
  );
}

/** The other partners beside the name in the conversation bar: a tap shows that one's conversation. */
export function PartnerSwitch() {
  if (!A.manyPartners()) return null;
  const shown = A.shownPartner()?.id ?? DEFAULT_PARTNER;
  const others = A.partners!.filter((p) => p.id !== shown);
  return (
    <span class="partner-switch" role="group" aria-label={t("partners.title")}>
      {others.map((p) => {
        const label = p.asks ? t("partners.switch.asks", p.name, p.asks) : t("partners.switch", p.name);
        return (
          <button key={p.id} class="partner-pick" aria-label={label} title={label} onClick={() => A.switchPartner(p.id)}>
            <Stone look={p.look} size={28} />
            {p.asks > 0 && <span class="partner-dot" aria-hidden="true" />}
          </button>
        );
      })}
    </span>
  );
}

const errorWord = (e: string | undefined) => (e ? t(`partners.error.${e}`) : "");

function LookPick({ value, onPick, label }: { value: PartnerLook; onPick: (l: PartnerLook) => void; label: string }) {
  return (
    <span class="look-pick" role="radiogroup" aria-label={label}>
      {PARTNER_LOOKS.map((l) => (
        <button key={l} class={`look-chip${l === value ? " on" : ""}`} role="radio" aria-checked={l === value} aria-label={t(`partners.look.${l}`)} title={t(`partners.look.${l}`)} data-look={l} onClick={() => onPick(l)} />
      ))}
    </span>
  );
}

function PartnerRow({ p }: { p: PartnerInfo }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const shown = (A.shownPartner()?.id ?? DEFAULT_PARTNER) === p.id;
  const save = () => {
    const n = draft.trim();
    if (n && n !== p.name) A.setPartner(p.id, { name: n });
    setEditing(false);
  };
  return (
    <div class="set-row partner-row">
      <Stone look={p.look} size={40} />
      <span class="grow partner-words">
        {editing ? (
          <input
            class="name-input"
            value={draft}
            maxLength={PARTNER_NAME_MAX}
            aria-label={t("partners.rename")}
            autoFocus
            onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.isComposing) save();
              if (e.key === "Escape") e.stopPropagation(), setEditing(false);
            }}
          />
        ) : (
          <b>{p.name}</b>
        )}
        {shown ? <small>{t("partners.talking")}</small> : null}
        <LookPick value={p.look} label={t("partners.look")} onPick={(look) => A.setPartner(p.id, { look })} />
      </span>
      {editing ? (
        <Btn kind="primary" size="sm" label={t("partners.rename.save")} onClick={save} />
      ) : (
        <>
          <Btn kind="text" size="sm" label={t("partners.rename")} about={p.name} onClick={() => (setDraft(p.name), setEditing(true))} />
          {!shown && <Btn kind="secondary" size="sm" label={t("partners.switch", p.name)} onClick={() => A.switchPartner(p.id)} />}
        </>
      )}
    </div>
  );
}

function AddForm({ done }: { done: () => void }) {
  const [name, setName] = useState("");
  const [look, setLook] = useState<PartnerLook>(nextLook((A.partners ?? []).map((p) => p.look)));
  const ask = A.partnerAsk?.kind === "add" ? A.partnerAsk : undefined;
  const go = () => {
    A.addPartner(name, look);
    setName("");
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
export function PartnersSection() {
  const [openedAt, setOpenedAt] = useState(0);
  if (!A.partners) return null;
  const ps = A.partners;
  const full = ps.length >= 4;
  const many = ps.length > 1;
  // A partner added since the form opened closes it.
  const open = openedAt > 0 && !(A.partnerAddedAt >= openedAt);
  const setAdding = (on: boolean) => setOpenedAt(on ? Date.now() : 0);
  return (
    <section class="set partners-set">
      <h3>{t("partners.title")}</h3>
      <div class="set-card">
        {many && ps.map((p) => <PartnerRow key={p.id} p={p} />)}
        {open ? <AddForm done={() => setAdding(false)} /> : !full && <AddRow label={t("partners.add")} help={t("partners.add.help")} onClick={() => ((A.partnerAsk = undefined), setAdding(true))} />}
      </div>
      <p class="small set-foot">{many ? t("partners.help") : ""}</p>
      <p class="small set-foot">{t("partners.preview")}</p>
    </section>
  );
}
