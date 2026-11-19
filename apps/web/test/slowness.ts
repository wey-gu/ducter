// Timing budgets that hold under load. A budget is a quiet Mac's, stretched by how slow this machine
// is right now: a fixed piece of work, timed in the same process. Measured once at load, and again
// at the moment a measurement misses its budget (load comes and goes while a suite runs), so a
// loaded machine (other suites, an e2e VM, a shared CI runner) doesn't fail the build while a real
// regression still does. Never under 1x (2x on CI), never over 4x. The Mac's twin is
// apps/desktop/internal/views/slowness_test.go.
const QUIET_MS = 35; // the loop below on a quiet Apple-silicon Mac (41 ms at best under load ~50)

function measure(): number {
  const runs: number[] = [];
  for (let r = 0; r < 5; r++) {
    const t0 = performance.now();
    const a: number[] = [];
    for (let i = 0; i < 200_000; i++) a.push((i * 2654435761) % 1000003);
    a.sort((x, y) => x - y);
    JSON.parse(JSON.stringify(a.slice(0, 20_000)));
    runs.push(performance.now() - t0);
  }
  runs.sort((x, y) => x - y);
  return Math.min(4, Math.max(process.env.CI ? 2 : 1, runs[2]! / QUIET_MS));
}

let slow = measure();

/**
 * The budget `ms` (a quiet Mac's) for a measurement that took `took`: stretched by the machine's
 * slowness; measured again first when `took` would miss it. Use as
 * `expect(took).toBeLessThan(budget(150, took))`.
 */
export function budget(ms: number, took: number): number {
  if (took >= ms * slow) {
    const now = measure();
    if (now > slow) console.log(`machine slowness ${slow.toFixed(2)}x -> ${now.toFixed(2)}x: budgets stretched by it`);
    slow = Math.max(slow, now);
  }
  return ms * slow;
}
