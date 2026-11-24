// D521: 后台 / In the background, over the opened task's composer: what its agent still runs beside
// its turn (background shells, subagents, Monitor watches, jobs), each one row with its drawn kind,
// its own words, how long it has run and 停下 / Stop where its agent can stop it; what ended folds
// under {n} 个做完了 / {n} done, each opening to its exit and its output's last lines. Quiet and
// dense: words in the muted ink, times in mono, nothing that glows. Open by default on a computer,
// folded on a phone; the person's choice is this device's (localStorage). Built only from the
// shared TrayRow and IconBtn (controls.tsx). The list is core's (TaskCard.background, folded from
// the Log), the same the Mac draws (views/bgtray.go).
import type { BgJob, BgKind, TaskBackground } from "@ducter/protocol";
import { useEffect, useState } from "preact/hooks";
import { A } from "./app.ts";
import { IconBtn, TrayRow } from "./controls.tsx";
import { StepMark } from "./transcript.tsx";
import { usePhone } from "./wide.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** The kind's mark: the transcript's own (a prompt for a shell, the hand-off arrow for a subagent), an eye for a watch. */
const MARK: Record<BgKind, string> = { shell: "ran", agent: "delegated", watch: "watch", other: "other" };

/** How long, in the tray's few characters: 27 秒 / 27s, 12 分 / 12m, 1 小时 20 分 / 1h 20m. */
export function bgSpan(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return t("bg.s", s);
  const m = Math.floor(s / 60);
  if (m < 60) return t("bg.m", m);
  const h = Math.floor(m / 60);
  return m % 60 ? t("bg.h", h, m % 60) : t("bg.h0", h);
}

/** A finished one's state in a word: its exit code when it failed with one. */
export function bgState(j: BgJob): string {
  if (j.state === "failed") return j.exit !== undefined && j.exit !== 0 ? t("bg.st.exit", j.exit) : t("bg.st.failed");
  return t(`bg.st.${j.state}`);
}

const titleOf = (j: BgJob) => j.title || t(`bg.untitled.${j.kind}`);

const KEY = "ducter.bgTray";
const saved = (): "open" | "shut" | undefined => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "open" || v === "shut" ? v : undefined;
  } catch {
    return undefined;
  }
};

/** Ticks while something runs: every second in a job's first minute, else every 15 s. */
function useTick(jobs: BgJob[]): number {
  const [now, setNow] = useState(Date.now());
  const run = jobs.filter((j) => j.state === "running");
  const young = run.some((j) => Date.now() - Date.parse(j.at) < 61_000);
  useEffect(() => {
    if (!run.length) return;
    const h = setInterval(() => setNow(Date.now()), young ? 1000 : 15_000);
    return () => clearInterval(h);
  }, [run.length, young]);
  return now;
}

const Mark = ({ k }: { k: string }) => <StepMark k={k} />;

export function BgTray({ taskId, bg }: { taskId: string; bg: TaskBackground | undefined }) {
  const phone = usePhone();
  const [pref, setPref] = useState(saved);
  const [doneOpen, setDoneOpen] = useState(false);
  const [tail, setTail] = useState<string | undefined>();
  const now = useTick(bg?.jobs ?? []);
  if (!bg || !bg.jobs.length) return null;
  const running = bg.jobs.filter((j) => j.state === "running");
  const done = bg.jobs.filter((j) => j.state !== "running").reverse(); // newest first
  // Only finished ones: the head is their fold, folded until opened (what ended needs no room while nothing runs).
  const open = running.length ? (pref ?? (phone ? "shut" : "open")) === "open" : doneOpen;
  const flip = () => {
    if (!running.length) return setDoneOpen(!doneOpen);
    const v = open ? "shut" : "open";
    try {
      localStorage.setItem(KEY, v);
    } catch {}
    setPref(v);
  };
  const since = running.length ? Math.min(...running.map((j) => Date.parse(j.at))) : NaN;
  const head = running.length ? t("bg.head", running.length) : t("bg.head.done", bg.done);
  return (
    <div class="bg-dock">
      <section class={`bg-tray${open ? " open" : ""}`} aria-label={head}>
        <TrayRow head words={head} mark={!running.length ? <Mark k="check" /> : undefined} tone={!running.length ? "done" : undefined} side={Number.isFinite(since) ? <span class="tray-time">{bgSpan(now - since)}</span> : undefined} open={open} onClick={flip} />
        {open && (
          <div class="bg-rows" role="list">
            {running.map((j) => {
              const stopping = A.bgStopping.has(`${taskId}|${j.id}`);
              const title = titleOf(j);
              return (
                <TrayRow
                  key={j.id}
                  mark={<Mark k={MARK[j.kind]} />}
                  markAbout={t(`bg.kind.${j.kind}`)}
                  words={title}
                  side={stopping ? <span class="tray-state">{t("bg.stopping")}</span> : <span class="tray-time">{bgSpan(now - Date.parse(j.at))}</span>}
                  act={
                    j.stop ? (
                      <IconBtn label={t("bg.stop")} about={title} danger disabled={stopping} onClick={() => A.stopBackground(taskId, j.id)}>
                        <Mark k="stop" />
                      </IconBtn>
                    ) : null
                  }
                />
              );
            })}
            {running.length > 0 && bg.done > 0 && <TrayRow mark={<Mark k="check" />} tone="done fold" words={t("bg.done", bg.done)} open={doneOpen} onClick={() => setDoneOpen(!doneOpen)} act={null} />}
            {doneOpen &&
              done.map((j) => {
                const ran = j.endedAt ? Date.parse(j.endedAt) - Date.parse(j.at) : NaN;
                return (
                  <TrayRow
                    key={j.id}
                    tone={`ended st-${j.state}`}
                    mark={<Mark k={MARK[j.kind]} />}
                    markAbout={t(`bg.kind.${j.kind}`)}
                    words={titleOf(j)}
                    side={
                      <>
                        {j.state !== "done" && <span class="tray-state">{bgState(j)}</span>}
                        {Number.isFinite(ran) && <span class="tray-time">{bgSpan(ran)}</span>}
                      </>
                    }
                    open={tail === j.id}
                    onClick={() => setTail(tail === j.id ? undefined : j.id)}
                    act={null}
                  >
                    <div class="bg-tail">
                      <span class="bg-tail-head">{t("bg.tail")}</span>
                      {j.tail ? <pre>{j.tail}</pre> : <span class="bg-tail-none">{t("bg.tail.none")}</span>}
                    </div>
                  </TrayRow>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}
