// A note the partner said by itself (D165, design/connectors.md §6), on the phone: one partner
// message, its opening line, up to three finds (its kind in small letters, two sentences, its one
// next step 好，<action> · 先等等 that never runs without Go, 怎么知道的 › with the evidence in
// place, 有用 · 这类不用告诉我), then 没说的; and the one ask a note may carry. Only shared controls.
import type { Bodies, FindView } from "@ducter/protocol";
import { useState } from "preact/hooks";
import { A } from "./app.ts";
import { replyKey, replyOfFind } from "./reply.tsx";
import { ProactiveChips } from "./accounts.tsx";
import { Btn } from "./controls.tsx";
import { ago } from "./format.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

function Find({ f, seq }: { f: FindView; seq?: number }) {
  const [how, setHow] = useState(false);
  const st = A.S.findStates.get(f.findId);
  const d = f.decisionId ? A.S.decisions.get(f.decisionId) : undefined;
  const open = !!d && !d.resolved && !d.pending;
  return (
    <div class="find" data-reply={seq !== undefined ? replyKey(replyOfFind(seq, f.findId, f.text)) : undefined} data-seq={undefined}>
      <div class="kind">{t(`kind.${f.kind}`)}</div>
      <div class="ftext">{f.text}</div>
      {d &&
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
          {f.how.map((h, i) => (
            <div key={i} class="small">
              <span class="sub">{ago(A.L, h.at)}</span> {h.what}
            </div>
          ))}
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
        <Ask n={n} />
      </div>
    </div>
  );
}
