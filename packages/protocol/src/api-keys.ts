// D298: a pasted API key. The person pastes one key; Ducter recognises the provider by the key's
// shape (research/102), checks it with one call that spends nothing, keeps it in the key file
// (keys.ts, 0600) and thinks with it. Pure data and shape matching here: core does the check
// (core/src/api-key.ts) and the CLI reuses it before Ducter runs (the Mac app's first run).
//
// Shapes are a guess, the check decides: several providers hand out plain `sk-…` keys, so a plain
// one is tried against each candidate in order and the first that knows it wins.
import { CLAUDE_TOKEN_ENV, type HarnessId } from "./harnesses.ts";
import { words, type LangTag } from "./lang.ts";

export const KEY_PROVIDERS = [
  "anthropic",
  "claude-token",
  "openai",
  "openrouter",
  "deepseek",
  "moonshot-cn",
  "moonshot",
  "dashscope",
  "zhipu-cn",
  "zai",
  "google",
  "xai",
  "groq",
] as const;
export type KeyProvider = (typeof KEY_PROVIDERS)[number];

/** How one provider's key is checked without spending: a read of the account, the key or the model list. */
export interface KeyCheckSpec {
  url: string;
  /** bearer: Authorization: Bearer; x-api-key: Anthropic's header; query: ?key= (Google). */
  auth: "bearer" | "x-api-key" | "query";
  headers?: Record<string, string>;
  /** What the answer says about money: a balance read (DeepSeek, Moonshot, OpenRouter's key). */
  balance?: "deepseek" | "moonshot" | "openrouter";
}

export interface KeyProviderInfo {
  id: KeyProvider;
  /** The provider's own name, as people know it (zh, en). */
  name: { zh: string; en: string };
  /** The variable the key is kept under in keys.env, the one its agent reads. */
  env: string;
  /** Which AI agent thinks with it: the first of these that this computer can run. */
  harnesses: HarnessId[];
  /** pi's provider id and the model the partner starts on (provider/model), when pi runs it. */
  pi?: { provider: string; model?: string };
  /** The check; absent: it can't be checked without spending (a login token). */
  check?: KeyCheckSpec;
  /** Reached from mainland China without a proxy (for the network line). */
  homeInChina: boolean;
  /** Ducter can't think with it yet (no agent speaks to it): recognised, checked, then said so. */
  unsupported?: true;
}

const both = (zh: string, en = zh) => ({ zh, en });

export const KEY_PROVIDER_INFO: Record<KeyProvider, KeyProviderInfo> = {
  anthropic: {
    id: "anthropic",
    name: both("Anthropic"),
    env: "ANTHROPIC_API_KEY",
    harnesses: ["claude-code", "pi"],
    pi: { provider: "anthropic", model: "anthropic/claude-sonnet-5-5" },
    check: { url: "https://api.anthropic.com/v1/models?limit=1", auth: "x-api-key", headers: { "anthropic-version": "2023-06-01" } },
    homeInChina: false,
  },
  "claude-token": {
    id: "claude-token",
    name: both("Claude Code 登录令牌", "Claude Code sign-in token"),
    env: CLAUDE_TOKEN_ENV,
    harnesses: ["claude-code"],
    homeInChina: false,
  },
  openai: {
    id: "openai",
    name: both("OpenAI"),
    env: "OPENAI_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "openai", model: "openai/gpt-6-luna" },
    check: { url: "https://api.openai.com/v1/models", auth: "bearer" },
    homeInChina: false,
  },
  openrouter: {
    id: "openrouter",
    name: both("OpenRouter"),
    env: "OPENROUTER_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "openrouter" },
    check: { url: "https://openrouter.ai/api/v1/key", auth: "bearer", balance: "openrouter" },
    homeInChina: false,
  },
  deepseek: {
    id: "deepseek",
    name: both("DeepSeek"),
    env: "DEEPSEEK_API_KEY",
    harnesses: ["deepseek-harness", "pi"],
    pi: { provider: "deepseek", model: "deepseek/deepseek-flash" },
    check: { url: "https://api.deepseek.com/user/balance", auth: "bearer", balance: "deepseek" },
    homeInChina: true,
  },
  "moonshot-cn": {
    id: "moonshot-cn",
    name: both("Kimi（月之暗面）", "Kimi (Moonshot)"),
    env: "MOONSHOT_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "moonshotai-cn", model: "moonshotai-cn/kimi-k2.6" },
    check: { url: "https://api.moonshot.cn/v1/users/me/balance", auth: "bearer", balance: "moonshot" },
    homeInChina: true,
  },
  moonshot: {
    id: "moonshot",
    name: both("Kimi（Moonshot 国际站）", "Kimi (Moonshot)"),
    env: "MOONSHOT_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "moonshotai", model: "moonshotai/kimi-k2.6" },
    check: { url: "https://api.moonshot.ai/v1/users/me/balance", auth: "bearer", balance: "moonshot" },
    homeInChina: false,
  },
  dashscope: {
    id: "dashscope",
    name: both("阿里云百炼（通义千问）", "Alibaba Cloud Model Studio (Qwen)"),
    env: "DASHSCOPE_API_KEY",
    harnesses: [],
    check: { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models", auth: "bearer" },
    homeInChina: true,
    unsupported: true,
  },
  "zhipu-cn": {
    id: "zhipu-cn",
    name: both("智谱 GLM", "Zhipu GLM"),
    env: "ZAI_CODING_CN_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "zai-coding-cn", model: "zai-coding-cn/glm-5.3" },
    check: { url: "https://open.bigmodel.cn/api/paas/v4/models", auth: "bearer" },
    homeInChina: true,
  },
  zai: {
    id: "zai",
    name: both("Z.ai GLM"),
    env: "ZAI_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "zai", model: "zai/glm-5.3" },
    check: { url: "https://api.z.ai/api/paas/v4/models", auth: "bearer" },
    homeInChina: false,
  },
  google: {
    id: "google",
    name: both("Google Gemini"),
    env: "GEMINI_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "google", model: "google/gemini-3.5-flash" },
    check: { url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", auth: "query" },
    homeInChina: false,
  },
  xai: {
    id: "xai",
    name: both("xAI Grok"),
    env: "XAI_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "xai" },
    check: { url: "https://api.x.ai/v1/api-key", auth: "bearer" },
    homeInChina: false,
  },
  groq: {
    id: "groq",
    name: both("Groq"),
    env: "GROQ_API_KEY",
    harnesses: ["pi"],
    pi: { provider: "groq" },
    check: { url: "https://api.groq.com/openai/v1/models", auth: "bearer" },
    homeInChina: false,
  },
};

/** What was pasted, cleaned: one line, no quotes, no `NAME=` in front, no "Bearer ". */
export function cleanKey(raw: string): string {
  let s = String(raw ?? "").trim();
  const assign = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.+)$/s.exec(s);
  if (assign) s = assign[1]!.trim();
  s = s.replace(/^bearer\s+/i, "").trim();
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
  return s;
}

/** The longest key anyone hands out is a few hundred characters; anything past this isn't a key. */
export const KEY_MAX = 512;

/**
 * The providers a key could be from, most likely first (research/102). Empty: it doesn't look like
 * any key Ducter knows (spaces, too short, a sentence). The check decides among several.
 */
export function recognizeKey(raw: string): KeyProvider[] {
  const k = cleanKey(raw);
  if (k.length < 20 || k.length > KEY_MAX || /\s/.test(k)) return [];
  if (/^sk-ant-oat\d+-/.test(k)) return ["claude-token"];
  if (/^sk-ant-/.test(k)) return ["anthropic"];
  if (/^sk-or-(?:v\d+-)?/.test(k)) return ["openrouter"];
  if (/^sk-(?:proj|svcacct)-/.test(k) || /T3BlbkFJ/.test(k)) return ["openai"];
  if (/^AIza[\w-]{35}$/.test(k)) return ["google"];
  if (/^xai-/.test(k)) return ["xai"];
  if (/^gsk_/.test(k)) return ["groq"];
  // Zhipu and Z.ai: an id and a secret joined by a dot.
  if (/^[0-9a-f]{32}\.[A-Za-z0-9]{10,}$/.test(k)) return ["zhipu-cn", "zai"];
  if (/^sk-/.test(k)) {
    const body = k.slice(3);
    // DeepSeek's are 32 lowercase letters and digits; Model Studio's look the same.
    if (/^[0-9a-z]{32}$/.test(body)) return ["deepseek", "dashscope"];
    // Moonshot's are longer, mixed case.
    if (/^[A-Za-z0-9]{40,64}$/.test(body)) return ["moonshot-cn", "moonshot"];
    return ["deepseek", "moonshot-cn", "moonshot", "dashscope"];
  }
  return [];
}

/** Why a key didn't work, as the partner says it (clients word each reason in both languages). */
export type KeyTrouble =
  | "shape" // doesn't look like a key
  | "wrong" // every candidate said it doesn't know this key
  | "no_balance" // the account has no money left
  | "limited" // too many requests, or a quota, right now
  | "blocked" // the provider can't be reached from here (in China: often needs a proxy)
  | "offline" // no network at all
  | "unsupported" // a real key Ducter can't think with yet (Model Studio)
  | "failed"; // anything else: the provider's own words in `detail`

/** D298: what adding a key came to. Never carries the key. */
export interface KeyResult {
  ok: boolean;
  provider?: KeyProvider;
  /** The provider's name in the person's language. */
  name?: string;
  /** The agent that will think with it, when one can. */
  harness?: HarnessId;
  /** ok, but this computer has no way to run that agent yet (pi needs node or pi). */
  needs?: "pi";
  /** The command that installs what is needed (pi's own installer), for a Terminal. */
  install?: string;
  /** The model the partner starts on. */
  model?: string;
  /** The provider answered the check (false: kept without a check, e.g. a sign-in token, or a route the provider doesn't have). */
  checked?: boolean;
  reason?: KeyTrouble;
  /** The provider's own short words, for "failed". */
  detail?: string;
  /** For "blocked": the provider sits outside China (the line suggests a proxy). */
  abroad?: boolean;
  /** The partner's words for it (keyWords), as the home and `ducter key add --json` send it. */
  say?: { zh: string; en: string };
}

/** pi's own installer (research/42): it brings Node itself when the computer has none. */
export const PI_INSTALL = "curl -fsSL https://pi.dev/install.sh | sh";

/** The name a provider goes by, in one language. */
export const keyName = (p: KeyProvider, lang: LangTag) => words(KEY_PROVIDER_INFO[p].name, lang);

/**
 * D298: the partner's own words for a key's result, both languages (the clients and the CLI show
 * them as they are). Never the key itself.
 */
export function keyWords(r: KeyResult): { zh: string; en: string } {
  const zn = r.provider ? keyName(r.provider, "zh") : "";
  const en = r.provider ? keyName(r.provider, "en") : "";
  if (r.ok && r.needs === "pi")
    return {
      zh: `这把 ${zn} 的密钥能用，我先替你收好了。还差一步：这台电脑要装上 pi 才能用它。`,
      en: `That ${en} key works, and it's kept. One more step: this computer needs pi to use it.`,
    };
  if (r.ok && r.provider === "claude-token")
    return { zh: "收好了。Claude Code 会用这个登录令牌，下次开始时就生效。", en: "Kept. Claude Code signs in with this token from its next start." };
  if (r.ok && r.checked === false)
    return { zh: `收好了，我会用这把 ${zn} 的密钥来思考和做事。`, en: `Kept. I'll think and work with this ${en} key.` };
  if (r.ok) return { zh: `好了，这把 ${zn} 的密钥能用。从现在起我用它来思考和做事。`, en: `That ${en} key works. From now on I think and work with it.` };
  switch (r.reason) {
    case "shape":
      return {
        zh: "这看起来不像 API 密钥。密钥是一长串字母和数字，中间没有空格，很多以 sk- 开头。",
        en: "That doesn't look like an API key. A key is one long string of letters and digits with no spaces, often starting with sk-.",
      };
    case "wrong":
      return r.provider
        ? { zh: `${zn} 说它不认识这把密钥：可能少复制了一截，或者已经作废了。去 ${zn} 的控制台再复制一次试试。`, en: `${en} says it doesn't know this key: part of it may be missing, or it was revoked. Copy it again from ${en}'s console.` }
        : { zh: "没有一家服务认得这把密钥：可能少复制了一截，或者已经作废了。", en: "No provider recognises this key: part of it may be missing, or it was revoked." };
    case "no_balance":
      return { zh: `密钥是对的，但 ${zn} 的账户里没有余额了。充一点值，再检查一次。`, en: `The key is right, but your ${en} account has no balance left. Top it up, then check again.` };
    case "limited":
      return { zh: `${zn} 说现在请求太多了。过一分钟再试一次。`, en: `${en} says there are too many requests right now. Try again in a minute.` };
    case "blocked":
      return r.abroad
        ? {
            zh: `从这里连不上 ${zn}。在中国大陆，它通常要开了代理才连得上；也可以换一把国内能直接用的密钥，比如 DeepSeek、Kimi 或智谱。`,
            en: `I can't reach ${en} from here. From mainland China it usually needs a proxy; or use a key from a provider reachable there, such as DeepSeek, Kimi or Zhipu.`,
          }
        : { zh: `连不上 ${zn}。看看网络通不通，再试一次。`, en: `I can't reach ${en}. Check the network, then try again.` };
    case "offline":
      return { zh: "这台电脑现在连不上网。连上以后再试一次。", en: "This computer isn't online right now. Try again once it is." };
    case "unsupported":
      return {
        zh: `这把 ${zn} 的密钥是对的，但我现在还不能用它来思考，支持很快就来。先换一把 DeepSeek、Kimi 或智谱的密钥吧。`,
        en: `That ${en} key is right, but I can't think with it yet; that's coming soon. For now, use a DeepSeek, Kimi or Zhipu key.`,
      };
    default:
      return r.detail
        ? { zh: `${zn || "服务"}没让检查通过：${r.detail}`, en: `${en || "The provider"} didn't accept it: ${r.detail}` }
        : { zh: "没检查成，再试一次。", en: "The check didn't go through. Try again." };
  }
}
