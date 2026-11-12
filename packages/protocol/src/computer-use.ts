// D235: 用电脑 / Use the computer. A task drives the apps on one of the person's Macs (the home or a
// worker) through Ducter's own app tools, with cua-driver underneath: the two macOS permissions
// cua-driver needs, the person's Go at the effect, and 停下 / Stop from any window.

/** macOS's two switches for cua-driver (System Settings › Privacy & Security). */
export interface ComputerPerms {
  /** Accessibility: it can use the mouse and keyboard in apps. */
  accessibility: boolean;
  /** Screen Recording: it can see what's on the screen. */
  screen: boolean;
}

/** A decision an app task asked for: one action that commits (go), or the person's own turn (user). */
/** app: the app as the person knows it (邮件, 微信), from the Mac; label: the button or menu item's words. */
export type ComputerAsk = { kind: "go"; app: string; label: string; effect: string } | { kind: "user"; app?: string };

export type ComputerClientFrame =
  // 打开设置指引 / Open the guide: cua-driver's own guide to the two switches, on that Mac's screen.
  | { t: "computer_grant"; device: string }
  // 停下 / Stop: the task stops using the person's apps now (its turn is interrupted and it is told).
  | { t: "computer_stop"; taskId: string };

export type ComputerServerFrame = { t: "computer_grant_result"; device: string; ok: boolean; reason?: "offline" | "cua_missing" | "not_mac" | "failed"; message?: string } | { t: "computer_stop_result"; taskId: string; ok: boolean };
