// 自动填充 / Autofill (D191, design/autofill.md): sign-ins, cards and the owner's details, kept
// on the home and filled into Ducter's browser by reference. What crosses this file is never a
// secret after it was saved: clients and models see names, handles, the last four digits and the
// details the owner lets Ducter read. A secret goes one way, in one frame (saved_put), and comes
// back only as a dot row.

/** What a saved thing is. */
export type SavedKind = "signin" | "card" | "detail";

/** The owner's details (你的资料 / Your details), one field each. */
export type DetailKey =
  | "name"
  | "email"
  | "phone"
  | "address"
  | "birthday"
  | "passport_number"
  | "passport_country"
  | "passport_expiry"
  | "known_traveler"
  | "loyalty"
  | "seat"
  | "meal";

/**
 * Who may see a detail. read: the partner and its tasks may read it (to choose a seat, to say
 * whose name the booking is in); fill: filled by reference only, and the first time on each site
 * the owner says OK (a passport number, a birthday, a home address).
 */
export const DETAIL_CLASS: Record<DetailKey, "read" | "fill"> = {
  name: "read",
  email: "read",
  phone: "read",
  address: "fill",
  birthday: "fill",
  passport_number: "fill",
  passport_country: "read",
  passport_expiry: "fill",
  known_traveler: "fill",
  loyalty: "fill",
  seat: "read",
  meal: "read",
};

export const DETAIL_KEYS = Object.keys(DETAIL_CLASS) as DetailKey[];

/** What a client sends to save one thing (the only frame that carries a secret). id: edit that one. */
export type SavedInput =
  | { kind: "signin"; id?: string; site: string; username: string; password?: string; label?: string }
  | { kind: "card"; id?: string; label?: string; name: string; number?: string; expMonth: number; expYear: number; postcode?: string }
  | { kind: "detail"; values: Partial<Record<DetailKey, string>> };

/** One saved sign-in or card as clients and models see it. */
export interface SavedView {
  id: string;
  handle: string; // what tasks name it by: "signin:github.com", "card:visa-4242"
  kind: "signin" | "card";
  label: string; // "GitHub", "Visa ••4242" (the owner's own label when given)
  site?: string; // a sign-in's site
  username?: string; // a sign-in's user name (not a secret: it says which account)
  brand?: string; // a card's network: visa, mastercard, amex, unionpay, jcb, discover, card
  last4?: string;
  exp?: string; // "08/29"
  name?: string; // the name on the card
  addedAt: string;
  usedAt?: string;
  okSites?: string[]; // sites the owner said OK to (a sign-in's first use)
}

/** 你的资料 / Your details as clients see them: read fields with their value, fill fields only as kept. */
export interface DetailView {
  key: DetailKey;
  handle: string; // "me.passport_number"
  kept: boolean;
  value?: string; // only for read fields
  hint?: string; // a fill field's last characters ("••• 123")
  okSites?: string[];
}

/** 用在了哪儿 / Where it was used: one line per use, no value ever. */
export interface SavedUse {
  at: string;
  handle: string;
  label: string;
  site: string;
  what: "filled" | "approved" | "ok" | "declined"; // approved: a payment Go (the amount); ok: a first use on a site
  taskId?: string;
  task?: string; // the task's title then
  amount?: string; // a payment: "USD 128.00"
}

/** The Autofill list (answer to saved, saved_put, saved_remove). */
export interface SavedFrame {
  t: "saved";
  items: SavedView[];
  details: DetailView[];
  uses: SavedUse[];
  /** Where the secrets are kept, said plainly: keychain (the Mac's), file (a key file on this computer). */
  keptIn: "keychain" | "file";
  ok?: boolean;
  reason?: "invalid" | "not_found" | "failed";
  message?: string;
}

/** D191: 付款 / Pay: a Go card for one payment (set by Ducter's browser_ask_to_pay, never by a task's words). */
export interface PayAsk {
  site: string; // the merchant's host, read from the page by code
  amount: string; // "128.00"
  currency: string; // "USD"
  what?: string; // "1 night, Hotel Okura, Nov 20" (the task's words)
  handle: string;
  card: string; // "Visa ••4242"
  last4: string;
  needsCvc: boolean; // the card asks for its security code (never kept; it goes to this one fill, never logged)
  firstHere: boolean; // never paid on this site before
}

/** D191: 第一次在 {site} 用 / First use on a site: a saved sign-in or a private detail. */
export interface FillAsk {
  site: string;
  handle: string;
  label: string; // "GitHub (wey@…)", "Passport number"
  kind: "signin" | "detail";
}

// ---------- Cards: the network, the checksum, how it shows ----------

/** Digits only. */
export const digits = (s: string): string => String(s ?? "").replace(/\D+/g, "");

/** The Luhn check every card number passes. */
export function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 12 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

/** The card network from its first digits. */
export function cardBrand(num: string): string {
  const d = digits(num);
  if (/^4/.test(d)) return "visa";
  if (/^(5[1-5]|2[2-7])/.test(d)) return "mastercard";
  if (/^3[47]/.test(d)) return "amex";
  if (/^62/.test(d)) return "unionpay";
  if (/^35/.test(d)) return "jcb";
  if (/^(6011|65|64[4-9])/.test(d)) return "discover";
  return "card";
}

export const BRAND_NAME: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", unionpay: "UnionPay", jcb: "JCB", discover: "Discover", card: "Card" };

/** "Visa ••4242". */
export const cardLabel = (brand: string, last4: string): string => `${BRAND_NAME[brand] ?? "Card"} ••${last4}`;

/** A site as saved: the host, lower case, without www. or a path ("https://www.GitHub.com/login" → "github.com"). */
export function siteOf(raw: string): string {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = `https://${s}`;
  try {
    return new URL(s).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A page on `host` belongs to `site` (the same host, or a subdomain of it: accounts.google.com is google.com's). */
export function onSite(host: string, site: string): boolean {
  const h = siteOf(host);
  const s = siteOf(site);
  return !!h && !!s && (h === s || h.endsWith(`.${s}`));
}
