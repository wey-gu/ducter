// D653 (research/244 rules 1 and 8): one living card per subject, hanging from the message
// that started the work. It says the subject's title in words, its state in one line and the newest
// real progress, and is revised in place — the report never becomes another message. The Mac draws
// the same (apps/desktop/internal/views/subjects.go); a row opens the task that keeps the card.
import type { SubjectCard } from "@ducter/protocol";
import { A } from "./app.ts";
import { AskMark } from "./asks.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The state as the mark the rest of the app uses, and its one word. */
function stateOf(c: SubjectCard): { mark: "working" | "done" | "needs_you" | "failed"; word: string } {
  switch (c.state) {
    case "waiting":
      return { mark: "needs_you", word: t("subject.waiting") };
    case "done":
      return { mark: "done", word: t("subject.done") };
    case "failed":
      return { mark: "failed", word: t("subject.failed") };
    default:
      return { mark: "working", word: t("subject.working") };
  }
}

export function SubjectCards({ cards }: { cards: SubjectCard[] }) {
  if (!cards.length) return null;
  return (
    <section class="subjects" aria-label={t("subject.label")}>
      {cards.map((c) => {
        const s = stateOf(c);
        return (
          <div class={`subject-card s-${s.mark}`} key={c.key} data-subject={c.key}>
            <button
              type="button"
              class="subject-row"
              disabled={!c.taskId}
              aria-label={`${c.title}: ${s.word}`}
              onClick={() => c.taskId && A.openTaskPage(c.taskId)}
            >
              <AskMark state={s.mark} />
              <span class="subject-text">
                <span class="subject-head">
                  <span class="subject-title" dir="auto">
                    {c.title}
                  </span>
                  <span class="subject-state">{s.word}</span>
                </span>
                {c.line && (
                  <span class="subject-line" dir="auto">
                    {c.line}
                  </span>
                )}
                {c.progress && c.progress !== c.line && (
                  <span class="subject-progress" dir="auto">
                    {c.progress}
                  </span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </section>
  );
}
