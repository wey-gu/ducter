// D566: 存到 Nowledge Mem / Save to Nowledge Mem, under a file card and in the viewer's action row.
// One quiet line under the card, never inside it (the whole card opens the file):
//   can save   Save to Nowledge Mem (a text button)
//   saving     the same button busy: Saving to Nowledge Mem…
//   saved      In Nowledge Mem, and Open Nowledge Mem where Mem is the person's Cloud
//   failed     Not saved: {Mem's reason}, with the one thing that fixes it (Try again, or Sign in)
// Shown only for a file Mem reads (memKeeps) while Mem is connected and signed in; a file already
// kept says so whatever Mem's state is now. Shared controls only (Btn, TextLink).
import { memKeeps, type MediaRef, type MemFileWhy } from "@ducter/protocol";
import { A } from "./app.ts";
import { Btn, TextLink } from "./controls.tsx";
import { keepInMem, keepNow, memKeepReady, memKeepWire } from "./mem-keep-state.ts";

memKeepWire((f) => A.send(f), () => A.changed());

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Mem's reason, in the person's words (D563: from Mem's facts). */
export function keepWhy(why: MemFileWhy, message?: string): string {
  if (why === "refused") return message ? t("memfile.why.refused", message) : t("memfile.why.refused.none");
  return t(`memfile.why.${why}`);
}

/** What the card or the viewer shows for this file: undefined when there is nothing to show. */
export function keepLook(m: MediaRef): "save" | "saving" | "saved" | "failed" | undefined {
  if (A.mem?.files?.[m.id]) return "saved";
  const n = keepNow(m.id);
  if (n) return n.state;
  return memKeeps(m) && memKeepReady(A.settings, A.mem) ? "save" : undefined;
}

/** The quiet line under a file card. */
export function MemKeep({ m }: { m: MediaRef }) {
  const look = keepLook(m);
  if (!look) return null;
  const saved = A.mem?.files?.[m.id];
  const n = keepNow(m.id);
  return (
    <div class={`memkeep is-${look}`} data-memkeep={m.id}>
      {look === "save" && <Btn kind="text" size="sm" label={t("memfile.save")} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />}
      {look === "saving" && <Btn kind="text" size="sm" busy label={t("memfile.saving")} onClick={() => {}} />}
      {look === "saved" && (
        <>
          <span class="mk-done">{t("memfile.saved")}</span>
          {saved?.web && <TextLink class="mk-open" href={saved.web} label={t("memfile.openWeb")} />}
        </>
      )}
      {look === "failed" && n?.state === "failed" && (
        <>
          <span class="mk-fail" role="status">
            {t("memfile.failed", keepWhy(n.why, n.message))}
          </span>
          {n.why === "signed_out" || n.why === "missing" || n.why === "off" ? (
            <Btn kind="text" size="sm" chev label={t(n.why === "signed_out" ? "memfile.signin" : "memfile.settings")} about="Nowledge Mem" onClick={() => A.openSettings("memory")} />
          ) : n.why === "unreachable" || n.why === "refused" ? (
            <Btn kind="text" size="sm" label={t("memfile.retry")} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />
          ) : null}
        </>
      )}
    </div>
  );
}

/** The viewer's action: a secondary button in its existing row while it can save or is saving, the quiet word once kept. */
export function MemKeepAction({ m }: { m: MediaRef }) {
  // What a task made (the person's own files open here too, and aren't Ducter's to keep).
  if (!m.from) return null;
  const look = keepLook(m);
  if (!look || look === "failed") return look === "failed" ? <MemKeep m={m} /> : null;
  if (look === "saved") return <MemKeep m={m} />;
  return <Btn kind="text" label={t(look === "saving" ? "memfile.saving" : "memfile.save")} busy={look === "saving"} about={m.name ?? ""} onClick={() => keepInMem(m.id)} />;
}
