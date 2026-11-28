// A note the partner said by itself (D165, design/connectors.md §6), on the phone: one partner
// message, its opening line, its finds (two sentences, where it came from in one quiet line, its one next
// step 好，<action> that never runs without Go beside 怎么知道的, the evidence in place ending in 有用 and
// 这类不用告诉我, D482);
// and the one ask a note may carry. Only shared controls. D453: a find said as an offer has no
// 先等等 (letting it be is the hold); past the first OFFER_SHOWN they wait under 还有几条 / A few more;
// one that faded keeps its words, dimmed, with no button and no word about having been missed.
import { OFFER_SHOWN, type Bodies, type FindView } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { HoverReply, replyKey, replyOfFind } from "./reply.tsx";
import { ProactiveChips } from "./accounts.tsx";
import { Btn, Facts, TextBox, TextLink } from "./controls.tsx";
import { openDid } from "./did.tsx";
import { LearnedLine } from "./recall.tsx";
import { ShadowLine } from "./shadow-review.tsx";
import { ago } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/**
 * D403: a 在等你回 find's reply, already written: who it goes to, the words (editable in place
 * while its Go is open), what to check first; after Go, a 30-second line with 撤回 / Undo, then 已发出.
 */
function Draft({ f, open, decide }: { f: FindView; open: boolean; decide: (text: string) => void }) {
  const dr = f.draft!;
  const send = A.S.findSends.get(f.findId);
  const [text, setText] = useState(dr.text);
  const [, tick] = useState(0);
  const sending = send?.state === "sending" && !!send.until;
  useEffect(() => {
    if (!sending) return;
    const h = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(h);
  }, [sending]);
  const left = sending ? Math.max(0, Math.ceil((Date.parse(send!.until!) - Date.now()) / 1000)) : 0;
  return (
    <div class={`fdraft${open ? " open" : ""}`}>
      <div class="fdraft-to small sub">{t("draft.to", dr.to)}</div>
      {open ? (
        <TextBox class="fdraft-text" value={text} lang={dr.lang} label={t("draft.edit", dr.to)} onInput={setText} />
      ) : (
        <div class="fdraft-text" lang={dr.lang}>
          {text}
        </div>
      )}
      {open && dr.check && <div class="small sub">{t("draft.check", dr.check)}</div>}
      {open ? (
        <div class="fstep">
          <Btn kind="secondary" size="sm" label={t("decision.go.label", f.goLabel ?? t("draft.send"))} about={dr.to} disabled={!text.trim()} onClick={() => decide(text)} />
          {!f.offer && <Btn kind="text" size="sm" label={t("decision.hold")} onClick={() => decide("")} />}
        </div>
      ) : sending ? (
        <div class="fstep">
          <span class="small sub" aria-live="polite">{t("draft.sending", left)}</span>
          <Btn kind="text" size="sm" label={t("draft.undo")} about={dr.to} onClick={() => A.undoFind(f.findId)} />
        </div>
      ) : send?.state === "sent" ? (
        <div class="small sub">{t("draft.sent", dr.to)}</div>
      ) : null}
      {open && send?.state === "send_failed" && <div class="small sub">{t(send.error === "no_send" ? "draft.no_send" : "draft.failed")}</div>}
    </div>
  );
}

/** D403: 看草稿 / See the draft, from Tasks: the conversation (on a phone, its pane), scrolled to the find, which glows once. */
export function seeDraft(findId: string) {
  if (A.route.name !== "conv") A.go({ name: "conv" });
  const find = (n: number) => {
    const el = document.getElementById(`find-${findId}`);
    if (!el) return void (n > 0 && setTimeout(() => find(n - 1), 80));
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  };
  setTimeout(() => find(12), 60);
}

function Find({ f, seq }: { f: FindView; seq?: number }) {
  const [how, setHow] = useState(false);
  const st = A.S.findStates.get(f.findId);
  // D403: after 撤回 or a failed send, the find's Go is asked again under a new decision.
  const did = A.S.findAsks.get(f.findId) ?? f.decisionId;
  const d = did ? A.S.decisions.get(did) : undefined;
  const open = !!d && !d.resolved && !d.pending;
  const send = A.S.findSends.get(f.findId);
  const rk = seq !== undefined ? replyKey(replyOfFind(seq, f.findId, f.text)) : undefined;
  // D453: an offer nothing came of fades: its words stay, dimmed; no button, no "missed".
  const faded = !!f.offer && st?.state === "passed";
  const drafted = !!f.draft && !!d && (open || !!send || (d.pending ?? d.resolved?.option) === "go");
  const going = !!d && (st?.state === "go" || (d.pending ?? d.resolved?.option) === "go");
  const howBtn = (
    <Btn kind="text" size="sm" class="fhow-btn" label={t("find.how")} chev expanded={how} onClick={() => {
      if (!how) A.openFinds([f.findId], "how"); // D464: counted once, never learned from
      setHow(!how);
    }} />
  );
  // D482: one grammar for every find: its words; one quiet line of where it came from (D458's origin,
  // else its kind, in the same small muted words); one row with its step and 怎么知道的 beside it; the
  // evidence in place, each source wrapping inside the note, with 有用 / 这类不用告诉我 at its end.
  return (
    <div class={`find${faded ? " faded" : ""}`} id={`find-${f.findId}`} data-reply={rk} data-seq={undefined}>
      {/* D256: the pebble rests outside the card, beside the find's words. */}
      <div class="ftext">
        {f.text}
        <HoverReply k={rk} />
      </div>
      <div class="small sub forigin">{f.origin || t(`kind.${f.kind}`)}</div>
      {f.draft && d && st?.state !== "passed" && drafted ? (
        <Draft f={f} open={open} decide={(text) => (text ? A.decide(d.decisionId, "go", text) : A.decide(d.decisionId, "hold"))} />
      ) : null}
      {faded ? null : (
        <div class="fstep">
          {d && !drafted && open && (
            <>
              <Btn kind="secondary" size="sm" label={t("decision.go.label", f.goLabel ?? "")} onClick={() => A.decide(d.decisionId, "go")} />
              {!f.offer && <Btn kind="text" size="sm" label={t("decision.hold")} onClick={() => A.decide(d.decisionId, "hold")} />}
            </>
          )}
          {d && !drafted && !open && (st?.state === "passed" ? (
            <span class="small sub fsaid">{t("find.passed")}</span>
          ) : going ? (
            <span class="small sub fsaid">{t("find.going")}</span>
          ) : f.offer ? null : (
            <span class="small sub fsaid">{t("find.held")}</span>
          ))}
          {howBtn}
        </div>
      )}
      {how && !faded && (
        <div class="fhow">
          {/* D388: each source in the order the find rests on them: where it was read, when, who; what
              it is (its page when it has one), wrapping inside the note; what it says. */}
          {f.how.map((h, i) => (
            <div class="fsrc-row" key={i}>
              <Facts class="small" items={[h.src && <span class="fsrc">{t(`find.src.${h.src}`)}</span>, <span class="sub">{ago(A.L, h.at)}</span>, h.from && <span class="sub">{h.from}</span>]} />
              {h.url ? (
                <TextLink class="flink" href={h.url} label={h.what} />
              ) : (
                <div class="fwhat">{h.what}</div>
              )}
              {h.says && <div class="fsays">{h.says}</div>}
            </div>
          ))}
          {f.unknown && <div class="small sub">{t("find.unknown", f.unknown)}</div>}
          {f.untouched && <div class="small sub">{f.untouched}</div>}
          <div class="ffeel">
            {st?.state === "muted" ? (
              <span class="small sub">{t("find.muted")}</span>
            ) : st?.state === "useful" ? (
              <span class="small sub">{t("find.thanked")}</span>
            ) : (
              <>
                <Btn kind="text" size="sm" label={t("find.useful")} about={f.text} onClick={() => A.reactFind(f.findId, "useful")} />
                <Btn kind="text" size="sm" label={t("find.mute")} about={f.text} onClick={() => A.reactFind(f.findId, "mute")} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Ask({ n }: { n: Bodies["finds"] }) {
  if (n.ask === "cadence")
    return (
      <div class="note-ask">
        <div class="ftext">{t("first.ask")}</div>
        {n.answered ? <div class="small sub">{t("first.chosen", t(`proactive.${n.answered}`))}</div> : <ProactiveChips inNote />}
      </div>
    );
  if (n.ask === "day_after") {
    // D623: an offer, not a card: no needs count, no default, no timer. Ignored is recorded
    // in the Log and shows nothing; yes/no settle in one tap.
    if (n.answered) return null; // settled quietly: the Log keeps yes/no/ignored
    return (
      <div class="fstep">
        <Btn kind="secondary" size="sm" label={t("day.after.yes")} onClick={() => A.answerNote(n.noteId, "day_after", true)} />
        <Btn kind="text" size="sm" label={t("day.after.no")} onClick={() => A.answerNote(n.noteId, "day_after", false)} />
      </div>
    );
  }
  if (n.ask !== "first_look" && n.ask !== "keep_note" && n.ask !== "note_again") return null;
  const ask = n.ask;
  const [yes, no] = ask === "keep_note" ? ["note.keep", "note.no_more"] : ask === "note_again" ? ["note.again_yes", "note.again_no"] : ["first.go", "first.no"];
  if (n.answered) return <div class="small sub">{t("note.answered", t(n.answered === "yes" ? yes : no))}</div>;
  return (
    <div class="fstep">
      <Btn kind="secondary" size="sm" label={t(yes)} onClick={() => A.answerNote(n.noteId, ask, true)} />
      <Btn kind="text" size="sm" label={t(no)} onClick={() => A.answerNote(n.noteId, ask, false)} />
    </div>
  );
}

export function FindsNote({ n, join, seq, seqs }: { n: Bodies["finds"]; join?: boolean; seq?: number; seqs?: string }) {
  // D453: the first OFFER_SHOWN offers in full; the rest wait under 还有几条 / A few more (no count).
  const [more, setMore] = useState(false);
  const offers = n.finds.filter((f) => f.offer).length;
  const fold = offers > OFFER_SHOWN && !more;
  let shownOffers = 0;
  const shown = n.finds.filter((f) => !f.offer || !fold || shownOffers++ < OFFER_SHOWN);
  return (
    <div class={`partner${join ? " join" : ""}`} data-seqs={seqs}>
      <div class="bubble note">
        {n.opening && <div class="ftext">{n.opening}</div>}
        {shown.map((f) => (
          <Find key={f.findId} f={f} seq={seq} />
        ))}
        {offers > OFFER_SHOWN && (
          <Btn kind="text" size="sm" chev expanded={more} class="fmore" label={t(more ? "find.fewer" : "find.more")} onClick={() => {
              // D464: the offers it brings into view count as opened (once each, for `ducter proactive week`).
              if (!more) A.openFinds(n.finds.filter((f) => f.offer).slice(OFFER_SHOWN).map((f) => f.findId), "more");
              setMore(!more);
            }} />
        )}
        <Ask n={n} />
        {/* D482: the note's ways on, one quiet row at its foot in the same words' size: D304's week of
            what it noted (the week's first note) and D300's Done for you (the morning's). */}
        {((n.learned && n.learned.count > 0) || (n.rung === "morning" && !n.quiet)) && (
          <div class="note-foot">
            {n.shadowReview && n.shadowReview.count > 0 && <ShadowLine count={n.shadowReview.count} until={n.shadowReview.until} />}
            {n.learned && n.learned.count > 0 && <LearnedLine count={n.learned.count} />}
            {n.rung === "morning" && !n.quiet && <Btn kind="text" size="sm" chev class="did-morning" label={t("did.link")} onClick={() => openDid()} />}
          </div>
        )}
      </div>
    </div>
  );
}
