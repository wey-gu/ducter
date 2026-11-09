// The mechanical half of done? -> done (focus-window-states): Ducter checks a done report's
// evidence refs where that is cheap and reliable, so "done" is not the task's word alone.
//  - a commit (a hex sha) must exist and be on the task branch;
//  - a file path must exist inside the task's place;
//  - anything else (a test count, a CI line, a URL, a log) is the task's word: left unchecked.
import { existsSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { EvidenceRef, Place } from "@ducter/protocol";
import { git } from "./places.ts";

const SHA = /^[0-9a-f]{7,40}$/i;

/** The refs with `check` set where a check applies; the rest are returned as they came. */
export async function checkEvidence(place: Place, cwd: string, evidence: EvidenceRef[]): Promise<EvidenceRef[]> {
  return Promise.all(evidence.map((e) => checkOne(place, cwd, e)));
}

async function checkOne(place: Place, cwd: string, e: EvidenceRef): Promise<EvidenceRef> {
  const ref = e.ref.trim();
  if (!ref) return e;
  if (SHA.test(ref) && (e.kind === "diff" || e.kind === "log")) {
    if (place.kind !== "repo") return e;
    // The task branch; without one (an explicit worktree), what that checkout has.
    const repo = place.branch ? place.repoPath : (place.worktree ?? place.repoPath);
    const tip = place.branch ? `refs/heads/${place.branch}` : "HEAD";
    const found = await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (!found.ok) return { ...e, check: "missing" };
    const on = await git(repo, ["merge-base", "--is-ancestor", found.out, tip]);
    return { ...e, check: on.ok ? "verified" : "missing" };
  }
  if (e.kind === "file" && cwd) {
    const path = ref.replace(/^file:\/\//, "");
    const abs = isAbsolute(path) ? path : resolve(cwd, path);
    const rel = relative(resolve(cwd), abs);
    if (rel.startsWith("..") || isAbsolute(rel)) return e; // outside the place: not ours to vouch for
    return { ...e, check: existsSync(abs) ? "verified" : "missing" };
  }
  return e;
}
