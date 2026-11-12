// D217: 用手机 / Use a phone. Ducter's own phone (an Android emulator on a Mac) as an ability on
// that computer's card: installing it (what it downloads, the licenses), its live view (watch a
// task use it, take turns, sign in yourself while the task is blind) and its decision cards.
// (Named phone-use, not phone: phone.ts is 打电话 / Calls.)

/** Installing: what is downloaded now (done/total bytes), unpacked, or the phone being made. */
export interface PhoneInstallStep {
  step: "download" | "unpack" | "phone";
  done?: number;
  total?: number;
}

/** What adding 用手机 costs and agrees to, for the install sheet (phone_terms). */
export interface PhoneTerms {
  ok: boolean;
  /** Why it can't be added here (not_mac_arm: phase 1 is Apple Silicon Macs). */
  reason?: "not_mac_arm" | "offline" | "failed";
  message?: string;
  download?: number; // bytes
  disk?: number; // bytes on disk after install, with a fresh phone
  packages?: { label: { zh: string; en: string }; version: string; size: number }[];
  licenses?: { id: string; title: { zh: string; en: string }; text: string; sha256: string }[];
}

/** A decision a phone task asked for: one tap that commits (go), or the user's own turn (user). */
/** app: the app's id (com.…, never shown); name: the app as the user knows it (信息, 小红书), from the task. */
/** on (D238): the person's own phone it happens on (its device id and name); absent = Ducter's phone. */
export type PhoneAsk = ({ kind: "go"; app: string; name?: string; label: string; effect: string } | { kind: "user"; app?: string }) & { on?: { device: string; name: string } };

/** Who the live view is for: watching a task, taking the phone yourself, or a card's own turn. */
export type PhoneMode = "watch" | "takeover" | "signin";

export type PhoneKey = "back" | "home" | "recents" | "enter" | "delete";

/** Input in the user's turn. x, y are fractions of the frame (0..1). */
export type PhoneInput =
  | { kind: "tap"; x: number; y: number; long?: boolean }
  | { kind: "swipe"; x1: number; y1: number; x2: number; y2: number; ms?: number }
  | { kind: "key"; key: PhoneKey }
  | { kind: "text"; text: string };

/** What the task just did on the phone, for the watcher's calm line (D190's, for the phone). */
export interface PhoneDoingView {
  kind: "look" | "tap" | "type" | "swipe" | "key" | "open" | "shot" | "waiting";
  label?: string;
  app?: string;
  x?: number;
  y?: number;
}

export type PhoneClientFrame =
  // The install sheet: sizes and the licenses' text as Google publishes them now.
  | { t: "phone_terms"; device?: string }
  // 加上 / Add: accepted = the licenses the person read and agreed to (id + sha256 of that text).
  | { t: "phone_install"; device?: string; accepted: { id: string; sha256: string }[] }
  // 抹掉这台手机 / Erase this phone: its apps, sign-ins and data (keepSdk: a fresh phone after), or everything.
  | { t: "phone_erase"; device?: string; keepSdk: boolean }
  // The live view. mode signin/takeover: the user's turn from the start (signin: a card's, decisionId).
  | { t: "phone_open"; device?: string; taskId?: string; decisionId?: string; mode: PhoneMode }
  | { t: "phone_input"; id: string; input: PhoneInput }
  | { t: "phone_ack"; id: string; seq: number }
  | { t: "phone_turn"; id: string; mine: boolean }
  | { t: "phone_pause"; id: string; paused: boolean }
  | { t: "phone_close"; id: string; done?: boolean };

export type PhoneServerFrame =
  | ({ t: "phone_terms" } & PhoneTerms)
  | { t: "phone_install_result"; ok: boolean; reason?: "license" | "space" | "failed" | "not_mac_arm" | "busy"; message?: string }
  | { t: "phone_erase_result"; ok: boolean; message?: string }
  // The view opened (starting while the phone boots), or closed (done, closed, replaced, gone, failed).
  | {
      t: "phone_view";
      id: string;
      state: "starting" | "open" | "closed";
      mode: PhoneMode;
      turn: "agent" | "you";
      here: boolean;
      device: string; // the computer's name
      taskId?: string;
      task?: { title: string; harness: string };
      decisionId?: string;
      reason?: "done" | "closed" | "replaced" | "gone" | "failed";
      message?: string;
    }
  // One JPEG frame (base64); the next only after phone_ack for this seq.
  | { t: "phone_frame"; id: string; seq: number; data: string; width: number; height: number; app?: string }
  | { t: "phone_doing"; id: string; doing: PhoneDoingView | null };
