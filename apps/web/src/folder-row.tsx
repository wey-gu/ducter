// D611: where each computer's Ducter folder lives. One shared rule row (D592's EditRow): its real
// path in mono, the whole row the button. Open, it offers macOS's own name (改成 ~/Ducter when the
// folder is a lowercase ~/ducter), 选一个位置… (this Mac's own folder picker; a path field for
// another computer), and 在访达中显示 for this Mac. A move with tasks working there lists their
// titles and waits; a finished move leaves one plain line. DUCTER_FOLDER is read-only: the row says
// so and doesn't open.
import type { DeviceView } from "@ducter/protocol";
import { A, tilde } from "./app.ts";
import { Btn, EditRow, Field } from "./controls.tsx";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

export function FolderRow({ dv, last }: { dv: DeviceView; last?: boolean }) {
  const f = dv.folder;
  if (!f) return null; // a Ducter too old to say where its folder is: no guessed path
  const st = A.folderRow(dv.id);
  const env = f.why === "env";
  const busy = !!st.busy;
  const values = busy ? [t("settings.folder.moving")] : [tilde(f.path)];
  const muted = env ? t("settings.folder.env") : st.done || "";
  const base = f.path.replace(/\/+$/, "").split("/").pop() ?? "";
  const platform = (dv.platform ?? "").toLowerCase();
  const mac = platform.includes("darwin") || platform.includes("mac") || (!platform && dv.home && typeof navigator !== "undefined" && /mac/i.test(navigator.platform ?? ""));
  const lower = mac && base.toLowerCase() === "ducter" && base !== "Ducter";
  return (
    <EditRow
      label={t("settings.folder.row")}
      values={values}
      muted={muted}
      editable={!env && !busy}
      open={!!st.open && !env}
      busy={busy}
      saveLabel={t("settings.folder.move")}
      busyLabel={t("settings.folder.moving")}
      mono={!busy}
      error={st.err}
      onOpen={() => {
        st.open = true;
        st.err = "";
        st.tasks = undefined;
        st.typed = f.path;
        A.changed();
      }}
      onSave={() => A.folderMove(dv.id, st.typed ?? f.path)}
      onCancel={() => {
        if (st.busy) return;
        st.open = false;
        st.err = "";
        st.tasks = undefined;
        A.changed();
      }}
    >
      {busy ? (
        <div class="fd-busy" role="status">
          <span class="spin" aria-hidden="true" />
          {t("settings.folder.moving")}
        </div>
      ) : (
        <>
          {!!st.tasks?.length && (
            <div class="fd-tasks" role="status">
              {st.tasks.map((x) => (
                <p key={x.taskId}>「{x.title}」</p>
              ))}
              <p class="fd-wait">{t("settings.folder.wait")}</p>
            </div>
          )}
          {lower && <Btn kind="secondary" size="sm" label={t("settings.folder.toMac")} onClick={() => A.folderMove(dv.id, "~/Ducter")} />}
          <Field value={st.typed ?? f.path} label={t("settings.folder.choose")} placeholder={t("settings.folder.path.placeholder")} onInput={(v) => ((st.typed = v), A.changed())} />
        </>
      )}
    </EditRow>
  );
}
