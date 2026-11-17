// D238: 用这台手机 / Use this phone. A task uses the person's OWN Android phone (not Ducter's
// emulator, phone-use.ts): the Ducter app on it reads other apps' screens and acts through an
// Android accessibility service, over the app's own connection to the home (the page in its web
// view relays). The tools, the gate and the blind rule stay on the home (core/src/handset/).
// Internally "handset", so it never collides with Ducter's phone (phone-use.ts) or calls (phone.ts).

/** What the Ducter app on the phone says about itself (its own switches), whenever they change. */
export interface HandsetState {
  /** The app's handset bridge version (1 in this build). */
  bridge: number;
  /** Android's SDK level (33 = Android 13). */
  sdk: number;
  /** The phone's model as Android names it ("Pixel Fold"). */
  model: string;
  /** D317: the phone itself says it folds (a hinge sensor, or Android reported a fold or dual-screen hinge). */
  foldable?: boolean;
  /** Ducter's accessibility service is on in Android's settings (and connected). */
  service: boolean;
  /**
   * Android 13+: restricted settings still keep the service's switch greyed out for Ducter (a
   * sideloaded app). true: restricted, or likely (installed from a downloaded file and never switched
   * on since); false: allowed, or never restricted (a store install, Android 12 or older, or the
   * switch has been on before); absent: the app can't tell on this phone.
   */
  restricted?: boolean;
  /**
   * While restricted: Android has shown its block once (the person tapped the grey Ducter row), so
   * App info's ⋮ now has Allow restricted settings; false: not yet. Absent: the app can't tell
   * (Android 16 refuses an app this read, D246), and the guide moves on by the person's visits.
   */
  seen?: boolean;
  /** It can take a picture of the screen (Android 11+, the accessibility screenshot). */
  pictures: boolean;
  /** A task is using it now (the session the home started), with its id. */
  session?: string;
  /**
   * D253 (bridge 2): the screen is on (Android's interactive state). Absent: an app from before D253.
   */
  awake?: boolean;
  /** D253: the lock screen is up. A loan never runs on a locked phone: locking gives it back. */
  locked?: boolean;
  /**
   * D280: the screen went off by itself while lent (a screen timeout, never the person's own lock):
   * the loan holds, nothing runs until the screen is on again, and the app wakes it. Told apart from a
   * lock by the lock screen: Android shows it at once for the power key, and for a timeout only after
   * its "lock after screen timeout" delay (5 s by default).
   */
  asleep?: boolean;
  /** D253: Android restricts Ducter in the background on this phone (Battery › Restricted). */
  limited?: boolean;
  /**
   * D253: the last loan this phone ended by itself, and why: the person tapped Stop (on the pill or
   * the notification), locked the phone, Android's switch went off, or the home went quiet (no word
   * for 15 s). Said again on every hello, so a home that missed the moment still learns why.
   */
  ended?: { session: string; why: HandsetEnd | "network" };
  /**
   * D255: this run of the app (a fresh id each time Android starts its process). A hello from a new
   * boot that holds no loan means the app was closed or killed since: said as such.
   */
  boot?: string;
  /** D255: which connection says this: the app's own link (a foreground service) or its page. */
  link?: "native" | "page";
  /** D255: the app's own link's generation in this boot (each reconnect is one more). */
  gen?: number;
  /** D255: Ducter's own recording of the screen, when one was asked for in a loan. */
  recording?: HandsetRecording;
  /**
   * D278: the app can dial a call sheet's number (handset_dial): granted (Android's Phone permission
   * is on: it rings at once), ask (it asks once, on the phone, the first time), denied (it opens
   * the dialer with the number filled). Absent: an app from before D278.
   */
  dial?: "granted" | "ask" | "denied";
}

/**
 * D255: a recording of the phone's screen the app makes itself (Android's MediaProjection, the
 * whole screen, no audio). asking: Android's own dialog is on the phone and the person answers it;
 * on: recording; saving: stopped, the file is being finished and sent to the home; saved: the home
 * has it; declined: the person said no (or didn't answer); failed: Android or the phone couldn't.
 */
export interface HandsetRecording {
  /** Its id (the app's), and the loan (task) it was asked for in. */
  id: string;
  session: string;
  state: "asking" | "on" | "saving" | "saved" | "declined" | "failed";
  /** When it started recording (the phone's epoch ms). */
  since?: number;
  /** Once stopped: its file's name on the phone, its length in ms and its size in bytes. */
  name?: string;
  ms?: number;
  bytes?: number;
  /** It stopped because the loan ended (Stop, a lock, the link lost), not by phone_record_stop; what was recorded is kept. */
  partial?: boolean;
  /** Why it failed or was declined, in a few words. */
  error?: string;
}

/**
 * D253: why a loan ended. stop: the person's 停下 / Stop (from any window or the phone); service:
 * Android's switch for Ducter went off; removed: 用这台手机 taken off the phone's card; locked: the
 * person locked the phone (locking gives it back); lost: the phone stopped answering (its app was
 * closed or paused, or it lost its network); done: the task stopped working. After stop, service and
 * removed the task never has the phone again; after locked and lost a new loan is a new card. D280,
 * given: the task gave it back itself (phone_give_back); its next phone tool asks with a new card.
 */
export type HandsetEnd = "stop" | "service" | "removed" | "locked" | "lost" | "done" | "given";

/** On a phone's card (reach.clients): 用这台手机 there, as the home holds it. */
export interface HandsetView {
  /** The person added it on this phone (the chip is on). */
  added: boolean;
  /** The app on that phone can do it at all (an Android app new enough). */
  able: boolean;
  /** What the app last said (absent until its page has said hello since the home started). */
  state?: Pick<HandsetState, "sdk" | "model" | "foldable" | "service" | "restricted" | "pictures">;
  /** Its app is connected now, so a task can be started on it. */
  linked: boolean;
  /** D278: its app is connected now and can dial a call sheet's number (在 Pixel Fold 上拨打). */
  dial?: boolean;
  /** A task using it now. quiet (D253): the phone hasn't answered for a few seconds (nothing reaches it). */
  using?: { taskId: string; title: string; app?: string; quiet?: boolean };
}

/** The phone's methods the home may call, a small fixed set (never a shell). */
export type HandsetMethod = "state" | "start" | "doing" | "stop" | "off" | "beat" | "screen" | "jpeg" | "tap" | "swipe" | "key" | "text" | "front" | "apps" | "launch" | "size" | "record" | "record_stop";

/**
 * A decision about the person's own phone: may this task use it now (use)? Or, D247: the task needs
 * a phone, and this one's app is connected but 用这台手机 isn't on yet (setup): Go opens the guide on
 * that phone, and once it is on the task uses it (the tap was for this task). D280 (record): it is the
 * person's turn on the phone, to allow a screen recording in Android's own prompt (「立即开始」 / Start
 * now), which shows only there: the card says so in every window, with the 2-minute countdown.
 */
export interface HandsetAsk {
  kind: "use" | "setup" | "record";
  /** The phone's device id and its name as the person named it ("Pixel Fold"). */
  device: string;
  name: string;
  /**
   * D280 (record): when Android's own recording prompt on the phone gives up (ISO time, 2 minutes
   * after it opened). The card counts down to it and resolves by itself when the person answers on
   * the phone or the prompt gives up; its one button is 不录了 / Skip recording.
   */
  until?: string;
}

export type HandsetClientFrame =
  // The page on that phone, inside the Ducter app: what its app can do now (and again on change).
  | { t: "handset_hello"; state: HandsetState }
  // The chip: add (from that phone itself, once Android's switch is on) or remove (from anywhere).
  | { t: "handset_set"; device?: string; on: boolean }
  // The page's answer to one handset_req, relayed from its app.
  | { t: "handset_res"; id: string; ok: boolean; result?: unknown; error?: string }
  // 停下 / Stop from any window (taskId), or from the phone's own indicator (the page relays it, from: "phone").
  | { t: "handset_stop"; taskId?: string; from?: "phone"; why?: "stop" | "locked" | "service" | "lost" | "network" }
  // D278: 在 Pixel Fold 上拨打 / Call on Pixel Fold: a call sheet's number, dialled by the Ducter app on
  // that phone (device; absent: the phone that last said hello). Answered with handset_dial_result.
  | { t: "handset_dial"; callId: string; device?: string }
  // D278: the page on that phone says how its app took it (rang, opened the dialer, or why not).
  | { t: "handset_dial_res"; id: string; ok: boolean; how?: DialHow; error?: string };

export type HandsetServerFrame =
  // One call into the phone's app, relayed by its page; answered with handset_res.
  | { t: "handset_req"; id: string; m: HandsetMethod; a: Record<string, unknown> }
  | { t: "handset_set_result"; device: string; on: boolean; ok: boolean; reason?: "not_android" | "service_off" | "unknown_device" | "old_app" }
  | { t: "handset_stop_result"; taskId?: string; ok: boolean }
  // D247: open the 用这台手机 guide on this phone now (a task's card asked for it, from any window).
  | { t: "handset_guide"; taskId?: string }
  // D278: to the page on the phone: dial this sheet's number through its app, and keep the sheet in
  // a notification during the call. Answered with handset_dial_res.
  | { t: "handset_dial_req"; id: string; callId: string; to: string; name: string; sheet: DialSheet }
  // D278: to the window that asked: how it went on the phone (by its name), or why not.
  | { t: "handset_dial_result"; callId: string; ok: boolean; phone?: string; how?: DialHow; reason?: "no_phone" | "no_sheet" | "failed" | "timeout"; error?: string };

/** D278: how the phone took a dial: rang (placed at once), dialer (number filled, the person taps call), note (a notification to tap: the app was behind another without the permission). */
export type DialHow = "rang" | "dialer" | "note";

/** D278: the sheet as the phone keeps it during the call (a notification): what for, the first words, the questions, what not to share. */
export interface DialSheet {
  goal: string;
  open: string;
  ask: string[];
  dont: string[];
  note: string[];
}
