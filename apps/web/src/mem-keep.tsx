// D566: 存到 Nowledge Mem / Save to Nowledge Mem, under a file card and in the viewer's foot bar.
// One quiet line under the card, never inside it (the whole card opens the file):
//   can save   Save to Nowledge Mem (a text button)
//   saving     the same button busy: Saving to Nowledge Mem…
//   saved      已存进 Nowledge Mem / In Nowledge Mem, then 去看 / Open (Mem on the web, where the
//              person's Mem is its Cloud): two elements, never one joined line (D291)
//   failed     D572: one line in the needs-you ink, human words (没存进 Nowledge Mem：{why}), the one
//              fix as a text button, and Mem's own sentence only behind 原话 / Its words
// The viewer (D572): its foot bar keeps one aligned row (来自… | 拷贝 | 存一份 | 存到 Nowledge Mem); a
// failure is its own full-width line above the bar (MemKeepTrouble), never wedged between buttons.
// Shown only for a file Mem reads (memKeeps) while Mem is connected and signed in; a file already
// kept says so whatever Mem's state is now. Shared controls only (Btn, TextLink).
import { useState } from "preact/hooks";
import { memKeeps, type MediaRef, type MemFileWhy } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn, TextLink } from "./controls.tsx";
import { keepInMem, keepNow, memKeepReady, memKeepWire } from "./mem-keep-state.ts";

memKeepWire((f) => A.send(f), () => A.changed());

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Why it wasn't kept, in the person's words (D563: from Mem's facts; D572: never Mem's raw sentence). */
export function keepWhy(why: MemFileWhy): string {
  return t(`memfile.why.${why}`);
}

/** What the card or the viewer shows for this file: undefined when there is nothing to show. */
export function keepLook(m: MediaRef): "save" | "saving" | "saved" | "failed" | undefined {
  if (A.mem?.files?.[m.id]) return "saved";
  const n = keepNow(m.id);
  if (n) return n.state;
  return memKeeps(m) && memKeepReady(A.settings, A.mem) ? "save" : undefined;
}

/** The one fix for a reason: Sign in or Open Settings (Settings › Memory), Try again, or none. */
function Fix({ m, why }: { m: MediaRef; why: MemFileWhy }) {
  if (why === "signed_out" || why === "missing" || why === "off")
    return <Btn kind="text" size="sm" class="mk-fix" chev label={t(why === "signed_out" ? "memfile.signin" : "memfile.settings")} about="Nowledge Mem" onClick={() => ((A.fileView = undefined), A.openSettings("memory"))} />;
  if (why === "unreachable" || why === "refused" || why === "no_space") return <Btn kind="text" size="sm" class="mk-fix" label={t("memfile.retry")} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />;
  return null;
}

/** D572: a failure as one line: the words, the fix, and Mem's own sentence on demand. */
function Trouble({ m, cls }: { m: MediaRef; cls: string }) {
  const n = keepNow(m.id);
  const [raw, setRaw] = useState(false);
  if (n?.state !== "failed") return null;
  return (
    <div class={`mk-trouble ${cls}`} data-memkeep={m.id}>
      <div class="mk-line">
        <span class="mk-fail" role="status">
          {t("memfile.failed", keepWhy(n.why))}
        </span>
        <Fix m={m} why={n.why} />
        {n.message && <Btn kind="text" size="sm" class="mk-raw-toggle" chev expanded={raw} label={t("memfile.raw")} about="Nowledge Mem" onClick={() => setRaw(!raw)} />}
      </div>
      {raw && n.message && (
        <p class="mk-raw" lang="en">
          {n.message}
        </p>
      )}
    </div>
  );
}

/** The quiet line under a file card. */
export function MemKeep({ m }: { m: MediaRef }) {
  const look = keepLook(m);
  if (!look) return null;
  if (look === "failed") return <Trouble m={m} cls="memkeep is-failed" />;
  const saved = A.mem?.files?.[m.id];
  return (
    <div class={`memkeep is-${look}`} data-memkeep={m.id}>
      {look === "save" && <Btn kind="text" size="sm" label={t("memfile.save")} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />}
      {look === "saving" && <Btn kind="text" size="sm" busy label={t("memfile.saving")} onClick={() => {}} />}
      {look === "saved" && (
        <>
          <span class="mk-done">{t("memfile.saved")}</span>
          {saved?.web && <TextLink class="mk-open" href={saved.web} label={t("memfile.open")} about={t("memfile.saved")} />}
        </>
      )}
    </div>
  );
}

/**
 * The viewer's slot, last in its foot bar: a text button while it can save (and after a failure,
 * so the row never re-lays out), busy while saving, the quiet word once kept.
 */
export function MemKeepAction({ m }: { m: MediaRef }) {
  // What a task made (the person's own files open here too, and aren't Ducter's to keep).
  if (!m.from) return null;
  const look = keepLook(m);
  if (!look) return null;
  if (look === "saved") {
    const saved = A.mem?.files?.[m.id];
    return (
      <span class="memkeep is-saved fv-keep" data-memkeep={m.id}>
        <span class="mk-done">{t("memfile.saved")}</span>
        {saved?.web && <TextLink class="mk-open" href={saved.web} label={t("memfile.open")} about={t("memfile.saved")} />}
      </span>
    );
  }
  return <Btn kind="text" class="fv-keep" label={t(look === "saving" ? "memfile.saving" : "memfile.save")} busy={look === "saving"} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />;
}

/** D572: the viewer's failure, its own full-width line above the foot bar. */
export function MemKeepTrouble({ m }: { m: MediaRef }) {
  if (!m.from || keepLook(m) !== "failed") return null;
  return <Trouble m={m} cls="fv-trouble" />;
}
