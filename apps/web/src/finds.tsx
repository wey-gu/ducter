// A note the partner said by itself (D165, design/connectors.md §6), on the phone: one partner
// message, its opening line, up to three finds (its kind in small letters, two sentences, its one
// next step 好，<action> · 先等等 that never runs without Go, 怎么知道的 › with the evidence in
// place, 有用 · 这类不用告诉我), then 没说的; and the one ask a note may carry. Only shared controls.
import type { Bodies, FindView } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { HoverReply, replyKey, replyOfFind } from "./reply.tsx";
import { ProactiveChips } from "./accounts.tsx";
import { Btn, Facts, LinkBtn, TextBox } from "./controls.tsx";
import { openDid } from "./did.tsx";
import { LearnedLine } from "./recall.tsx";
import { ago } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/**
 * D402: a 在等你回 find's reply, already written: who it goes to, the words (editable in place
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
          <Btn kind="text" size="sm" label={t("decision.hold")} onClick={() => decide("")} />
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

function Find({ f, seq }: { f: FindView; seq?: number }) {
  const [how, setHow] = useState(false);
  const st = A.S.findStates.get(f.findId);
  // D402: after 撤回 or a failed send, the find's Go is asked again under a new decision.
  const did = A.S.findAsks.get(f.findId) ?? f.decisionId;
  const d = did ? A.S.decisions.get(did) : undefined;
  const open = !!d && !d.resolved && !d.pending;
  const send = A.S.findSends.get(f.findId);
  const rk = seq !== undefined ? replyKey(replyOfFind(seq, f.findId, f.text)) : undefined;
  return (
    <div class="find" data-reply={rk} data-seq={undefined}>
      <div class="kind">{t(`kind.${f.kind}`)}</div>
      {/* D256: the pebble rests outside the card, beside the find's words. */}
      <div class="ftext">
        {f.text}
        <HoverReply k={rk} />
      </div>
      {f.draft && d && st?.state !== "passed" && (send || open || (d.pending ?? d.resolved?.option) === "go") ? (
        <Draft f={f} open={open} decide={(text) => (text ? A.decide(d.decisionId, "go", text) : A.decide(d.decisionId, "hold"))} />
      ) : null}
      {d &&
        !(f.draft && (open || send || (d.pending ?? d.resolved?.option) === "go")) &&
        (st?.state === "passed" ? (
          <div class="small sub">{t("find.passed")}</div>
        ) : open ? (
          <div class="fstep">
            <Btn kind="secondary" size="sm" label={t("decision.go.label", f.goLabel ?? "")} onClick={() => A.decide(d.decisionId, "go")} />
            <Btn kind="text" size="sm" label={t("decision.hold")} onClick={() => A.decide(d.decisionId, "hold")} />
          </div>
        ) : (
          <div class="small sub">{t((d.pending ?? d.resolved?.option) === "go" ? "find.going" : "find.held")}</div>
        ))}
      <div class="freact">
        <Btn kind="text" size="sm" label={t("find.how")} chev expanded={how} onClick={() => setHow(!how)} />
        <span class="grow" />
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
      {how && (
        <div class="fhow">
          {/* D388: each line is one source, in the order the find rests on them: where it was read, what it is, what it says, its page. */}
          {f.how.map((h, i) => (
            <Facts
              key={i}
              class="small"
              items={[
                h.src && <span class="fsrc">{t(`find.src.${h.src}`)}</span>,
                <span class="sub">{ago(A.L, h.at)}</span>,
                h.from && <span class="sub">{h.from}</span>,
                h.url ? <LinkBtn kind="text" size="sm" class="flink" href={h.url} label={h.what} /> : h.what,
                h.says && <span class="fsays">{h.says}</span>,
              ]}
            />
          ))}
          {f.unknown && <div class="small sub">{t("find.unknown", f.unknown)}</div>}
          {f.untouched && <div class="small sub">{f.untouched}</div>}
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
  return (
    <div class={`partner${join ? " join" : ""}`} data-seqs={seqs}>
      <div class="bubble note">
        {n.opening && <div class="ftext">{n.opening}</div>}
        {n.finds.map((f) => (
          <Find key={f.findId} f={f} seq={seq} />
        ))}
        {/* D304: the week's first note offers, in one line, what it noted about them. */}
        {n.learned && n.learned.count > 0 && <LearnedLine count={n.learned.count} />}
        <Ask n={n} />
      </div>
      {/* D300: under the morning note, the quiet way to what it did for you. */}
      {n.rung === "morning" && !n.quiet && (
        <Btn kind="text" size="sm" chev class="did-morning" label={t("did.link")} onClick={() => openDid()} />
      )}
    </div>
  );
}
