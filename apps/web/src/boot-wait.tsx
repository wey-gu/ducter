// D474: opening the page never stays blank. Until the app has something to show, the page shows the
// partner waiting with words; when it can't open (the home doesn't answer in time, or the page broke
// drawing itself) it says so plainly with one Try again. index.html carries the same ground for the
// case where this code never runs at all (a download that stalls, a script the browser refuses).
import { Component, type ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Avatar } from "./views.tsx";
import { Btn } from "./controls.tsx";

/** How long the first open waits on the home's /api/me before it says it couldn't. */
export const BOOT_TIMEOUT_MS = 10_000;
/** Past this the waiting words add that it is slower than usual. */
export const BOOT_SLOW_MS = 4_000;

export type BootState = { kind: "waiting" } | { kind: "unreachable"; host: string } | { kind: "broken" };

type T = (k: string, ...a: unknown[]) => string;

/** The words for a state: a heading, the line under it (if any), and the button (failures only). */
export function bootWords(t: T, s: BootState, slow = false): { title: string; body?: string; retry?: string } {
  if (s.kind === "waiting") return { title: t("boot.waiting"), ...(slow ? { body: t("boot.slow") } : {}) };
  return { title: t("boot.failed"), body: s.kind === "unreachable" ? t("boot.unreachable", s.host) : t("boot.broken"), retry: t("boot.retry") };
}

export function BootWait({ t, state, onRetry }: { t: T; state: BootState; onRetry: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (state.kind !== "waiting") return;
    const h = setTimeout(() => setSlow(true), BOOT_SLOW_MS);
    return () => clearTimeout(h);
  }, [state.kind]);
  const w = bootWords(t, state, slow);
  return (
    <main class={`boot-wait${state.kind === "waiting" ? "" : " failed"}`} aria-busy={state.kind === "waiting"} role={state.kind === "waiting" ? "status" : "alert"}>
      <div class="face">
        <Avatar size={120} state={state.kind === "waiting" ? "working" : "idle"} />
      </div>
      <h1>{w.title}</h1>
      {w.body && <p>{w.body}</p>}
      {w.retry && <Btn kind="primary" size="lg" label={w.retry} onClick={onRetry} />}
    </main>
  );
}

/** Anything that throws while drawing the app shows the failure ground with Try again, never a blank page. */
export class Guard extends Component<{ t: T; children: ComponentChildren }, { broke: boolean }> {
  state = { broke: false };
  static getDerivedStateFromError() {
    return { broke: true };
  }
  componentDidCatch(e: unknown) {
    console.error("[ducter] the page broke drawing itself", e);
    this.setState({ broke: true });
  }
  render() {
    return this.state.broke ? <BootWait t={this.props.t} state={{ kind: "broken" }} onRetry={() => location.reload()} /> : this.props.children;
  }
}

/** A promise that gives up after `ms` with `fallback` (the request itself is left to finish or fail). */
export function within<V>(p: Promise<V>, ms: number, fallback: V): Promise<V> {
  return new Promise((resolve) => {
    const h = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => (clearTimeout(h), resolve(v)),
      () => (clearTimeout(h), resolve(fallback)),
    );
  });
}
