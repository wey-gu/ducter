// D341: the Android app's own version, and its own 检查更新 / Check for updates, on the phone's
// Settings › 这台手机 and on this phone's card in 你的设备. The app answers with its own card at
// the bottom (在检查… / 已经是最新的 / 有新版本 {v}), so the row only asks. Two facts, two
// elements (D291); the button is the shared one, 44 px tall on a touch screen.
import { nativeCall, nativeInfo } from "./native.ts";
import { Btn } from "./controls.tsx";
import { A } from "./app.ts";

const t = (key: string, ...args: unknown[]) => A.L.t(key, ...args);

/** Only inside the Android app: the iPhone app updates from the App Store, a browser needs nothing. */
export const androidAppVersion = (): string | undefined => {
  const n = nativeInfo();
  return n?.platform === "android" ? n.version : undefined;
};

export const checkAppUpdate = () => void nativeCall({ t: "update.check" });

export function AppUpdateRow() {
  const v = androidAppVersion();
  if (!v) return null;
  return (
    <div class="set-item app-row">
      <span class="grow">
        <b>{t("app.this")}</b>
        <small>{t("devup.version", v)}</small>
      </span>
      <Btn kind="secondary" size="sm" label={t("app.check")} onClick={checkAppUpdate} />
    </div>
  );
}
