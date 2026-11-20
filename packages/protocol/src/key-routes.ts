// D440: a way to get a key, for someone with no AI plan and no key (research/189). When nothing
// on the home can think, the key card offers the one or two fastest ways to a working key from
// where the home is: its time zone says the region (the key is used from the home's network, not
// from the phone that pastes it), the person's language says the words. Each way is the provider's
// own key page, opened in the browser, three short steps, what it costs and needs, and one honest
// note where there is one. Ducter never makes an account or a key itself: the person does, on the
// provider's own page. Pure data here: the home sends the ways in first_screen (keyRoutes), the
// CLI's doctor sends them to the Mac's first run.
import type { KeyProvider } from "./api-keys.ts";
import type { LangTag } from "./lang.ts";

type Both = { zh: string; en: string };

export interface KeyRoute {
  id: "gemini" | "openrouter-free" | "kimi-voucher" | "deepseek-topup";
  provider: KeyProvider;
  /** The provider as people know it. */
  name: Both;
  /** Where the key is made: the provider's own key page. */
  url: string;
  /** Free to start (no money, no card). */
  free: boolean;
  /** One line: what it costs, what signing up needs, how long. */
  line: Both;
  /** Three short steps, from the page to the field. */
  steps: Both[];
  /** One honest thing to know before signing up, when there is one. */
  note?: Both;
}

const back = {
  zh: "回到这里，贴进上面的框，我自己会检查。",
  en: "Come back and paste it in the field above. I check it by myself.",
};

export const KEY_ROUTES: Record<KeyRoute["id"], KeyRoute> = {
  // research/189 §1: free, no card, a Google account; the free tier's content may train Google's models.
  gemini: {
    id: "gemini",
    provider: "google",
    name: { zh: "Google Gemini", en: "Google Gemini" },
    url: "https://aistudio.google.com/apikey",
    free: true,
    line: {
      zh: "免费，用你的 Google 账号，不用信用卡，大约一分钟。",
      en: "Free with your Google account, no card, about a minute.",
    },
    steps: [
      {
        zh: "用 Google 账号登录 AI Studio。",
        en: "Sign in to AI Studio with your Google account.",
      },
      {
        zh: "点「Create API key」，再点复制。",
        en: "Click “Create API key”, then copy it.",
      },
      back,
    ],
    note: {
      zh: "免费用的时候，Google 可能会用你发的内容改进它的模型。别发敏感的东西；在意的话，以后换成付费的就不会。",
      en: "On the free tier Google may use what you send to improve its models. Don't send anything sensitive; a paid key later stops that.",
    },
  },
  // research/189 §1: free models with tools, about 50 requests a day without credit bought.
  "openrouter-free": {
    id: "openrouter-free",
    provider: "openrouter",
    name: { zh: "OpenRouter", en: "OpenRouter" },
    url: "https://openrouter.ai/settings/keys",
    free: true,
    line: {
      zh: "免费，用 Google 或 GitHub 账号登录，每天能问五十次左右。",
      en: "Free with a Google or GitHub sign-in, about fifty questions a day.",
    },
    steps: [
      { zh: "登录 OpenRouter。", en: "Sign in to OpenRouter." },
      {
        zh: "点「Create」建一个密钥，再复制。",
        en: "Click “Create” to make a key, then copy it.",
      },
      back,
    ],
  },
  // research/189 §2: ¥15 of trial credit for a sign-up with a mainland China mobile number.
  "kimi-voucher": {
    id: "kimi-voucher",
    provider: "moonshot-cn",
    name: { zh: "Kimi", en: "Kimi" },
    url: "https://platform.moonshot.cn/console/api-keys",
    free: true,
    line: {
      zh: "用中国大陆手机号注册，送 15 元体验额度，够聊很久。",
      en: "Sign up with a mainland China mobile number and get ¥15 of trial credit.",
    },
    steps: [
      {
        zh: "用手机号登录 Kimi 开放平台。",
        en: "Sign in to the Kimi platform with your phone number.",
      },
      {
        zh: "在「API Key 管理」里新建一个，复制。",
        en: "Under API keys, make a new one and copy it.",
      },
      back,
    ],
  },
  // research/189 §2: no free credit; ID verification and a small top-up; the cheapest strong one.
  "deepseek-topup": {
    id: "deepseek-topup",
    provider: "deepseek",
    name: { zh: "DeepSeek", en: "DeepSeek" },
    url: "https://platform.deepseek.com/api_keys",
    free: false,
    line: {
      zh: "手机号注册，要先实名、充一点钱；几块钱能用很久。",
      en: "Sign up with a phone number; it needs ID verification and a small top-up. A few yuan lasts a long time.",
    },
    steps: [
      {
        zh: "用手机号登录 DeepSeek 开放平台，实名后充一点值。",
        en: "Sign in to the DeepSeek platform with your phone, verify, and top up a little.",
      },
      {
        zh: "在「API keys」里创建一个，复制。",
        en: "Under API keys, create one and copy it.",
      },
      back,
    ],
  },
};

/** Mainland China's time zones (the IANA names and their old aliases). */
const CHINA = new Set([
  "Asia/Shanghai",
  "Asia/Chongqing",
  "Asia/Chungking",
  "Asia/Harbin",
  "Asia/Urumqi",
  "Asia/Kashgar",
  "PRC",
]);
/** Where Google's free Gemini tier isn't offered (research/189 §4): Hong Kong, Macau, Russia, and a few more by their main zones. */
const NO_GEMINI = new Set([
  "Asia/Hong_Kong",
  "Hongkong",
  "Asia/Macau",
  "Asia/Macao",
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/Samara",
  "Europe/Volgograd",
  "Asia/Yekaterinburg",
  "Asia/Omsk",
  "Asia/Novosibirsk",
  "Asia/Krasnoyarsk",
  "Asia/Irkutsk",
  "Asia/Yakutsk",
  "Asia/Vladivostok",
  "Asia/Magadan",
  "Asia/Kamchatka",
  "Asia/Tehran",
  "Iran",
  "Asia/Pyongyang",
  "America/Havana",
  "Cuba",
  "Asia/Damascus",
  "Europe/Minsk",
]);

export type KeyRegion = "china" | "no-gemini" | "elsewhere";

/** The home's region for keys: its time zone first; with none, a Chinese language counts as mainland China. */
export function keyRegion(o: { tz?: string; lang?: LangTag }): KeyRegion {
  const tz = o.tz?.trim();
  if (tz)
    return CHINA.has(tz)
      ? "china"
      : NO_GEMINI.has(tz)
        ? "no-gemini"
        : "elsewhere";
  const l = String(o.lang ?? "");
  return /^zh(?![-_](?:hant|tw|hk|mo))/i.test(l) ? "china" : "elsewhere";
}

/** The ways to a key for this home, best first, at most two. */
export function keyRoutes(o: { tz?: string; lang?: LangTag }): KeyRoute[] {
  const r = keyRegion(o);
  const ids: KeyRoute["id"][] =
    r === "china"
      ? ["kimi-voucher", "deepseek-topup"]
      : r === "no-gemini"
        ? ["openrouter-free", "deepseek-topup"]
        : ["gemini", "openrouter-free"];
  return ids.map((id) => KEY_ROUTES[id]);
}
