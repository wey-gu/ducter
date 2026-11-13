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
  /** Ducter's accessibility service is on in Android's settings (and connected). */
  service: boolean;
  /**
   * Android 13+: restricted settings still keep the service's switch greyed out for Ducter (a
   * sideloaded app). true: still restricted; false: allowed (or never restricted); absent: the app
   * can't tell on this phone.
   */
  restricted?: boolean;
  /** It can take a picture of the screen (Android 11+, the accessibility screenshot). */
  pictures: boolean;
  /** A task is using it now (the session the home started), with its id. */
  session?: string;
}

/** On a phone's card (reach.clients): 用这台手机 there, as the home holds it. */
export interface HandsetView {
  /** The person added it on this phone (the chip is on). */
  added: boolean;
  /** The app on that phone can do it at all (an Android app new enough). */
  able: boolean;
  /** What the app last said (absent until its page has said hello since the home started). */
  state?: Pick<HandsetState, "sdk" | "model" | "service" | "restricted" | "pictures">;
  /** Its app is connected now, so a task can be started on it. */
  linked: boolean;
  /** A task using it now. */
  using?: { taskId: string; title: string; app?: string };
}

/** The phone's methods the home may call, a small fixed set (never a shell). */
export type HandsetMethod = "state" | "start" | "doing" | "stop" | "off" | "screen" | "jpeg" | "tap" | "swipe" | "key" | "text" | "front" | "apps" | "launch" | "size";

/**
 * A decision about the person's own phone: may this task use it now (use)? Or, D247: the task needs
 * a phone, and this one's app is connected but 用这台手机 isn't on yet (setup): Go opens the guide on
 * that phone, and once it is on the task uses it (the tap was for this task).
 */
export interface HandsetAsk {
  kind: "use" | "setup";
  /** The phone's device id and its name as the person named it ("Pixel Fold"). */
  device: string;
  name: string;
}

export type HandsetClientFrame =
  // The page on that phone, inside the Ducter app: what its app can do now (and again on change).
  | { t: "handset_hello"; state: HandsetState }
  // The chip: add (from that phone itself, once Android's switch is on) or remove (from anywhere).
  | { t: "handset_set"; device?: string; on: boolean }
  // The page's answer to one handset_req, relayed from its app.
  | { t: "handset_res"; id: string; ok: boolean; result?: unknown; error?: string }
  // 停下 / Stop from any window (taskId), or from the phone's own indicator (the page relays it, from: "phone").
  | { t: "handset_stop"; taskId?: string; from?: "phone" };

export type HandsetServerFrame =
  // One call into the phone's app, relayed by its page; answered with handset_res.
  | { t: "handset_req"; id: string; m: HandsetMethod; a: Record<string, unknown> }
  | { t: "handset_set_result"; device: string; on: boolean; ok: boolean; reason?: "not_android" | "service_off" | "unknown_device" | "old_app" }
  | { t: "handset_stop_result"; taskId?: string; ok: boolean }
  // D247: open the 用这台手机 guide on this phone now (a task's card asked for it, from any window).
  | { t: "handset_guide"; taskId?: string };
