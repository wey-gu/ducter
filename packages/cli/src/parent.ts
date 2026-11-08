// Ties `ducter up` to the app that started it. Ducter.app runs `ducter up --no-desktop` as its
// child with DUCTER_PARENT_PID set; when the app goes away (quit, crash, force quit), Ducter
// stops too, so nothing keeps running behind a window the person already closed.

export interface ParentProbe {
  /** True while a process with this pid exists. */
  alive(pid: number): boolean;
  /** This process's parent pid now (it becomes 1 once the parent dies and launchd adopts us). */
  ppid(): number;
}

export const realProbe: ParentProbe = {
  alive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "EPERM"; // exists, owned by someone else
    }
  },
  ppid: () => process.ppid,
};

/** The pid to watch, from DUCTER_PARENT_PID, or undefined. */
export function parentPid(env: Record<string, string | undefined>): number | undefined {
  const n = Number(env.DUCTER_PARENT_PID);
  return Number.isInteger(n) && n > 1 ? n : undefined;
}

/** True once the parent is gone: the pid no longer exists, or we were handed to another parent. */
export function parentGone(pid: number, probe: ParentProbe = realProbe): boolean {
  return !probe.alive(pid) || probe.ppid() !== pid;
}

/** Calls onGone once, when the parent goes away. Returns a function that stops watching. */
export function watchParent(pid: number, onGone: () => void, probe: ParentProbe = realProbe, everyMs = 1000): () => void {
  const timer = setInterval(() => {
    if (!parentGone(pid, probe)) return;
    clearInterval(timer);
    onGone();
  }, everyMs);
  return () => clearInterval(timer);
}
