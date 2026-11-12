// D221 (design/calendar.md §6): calendar times in the person's words. Every time arrives as an ISO
// string carrying the person's own offset (all-day: YYYY-MM-DD), so the wall clock is read from the
// string itself, never from this device's zone (a phone abroad still shows the person's day).
// Pure: tested in test/calendar.test.ts.

/** zh joins a date and its weekday with a no-break space: t() drops a plain space between Han (D78). */
const ZH_WD = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const EN_WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EN_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type CalLang = "zh" | "en";

/** "2026-11-19" of an ISO time or date. */
export const ymdOf = (iso: string) => iso.slice(0, 10);
/** "15:00" of an ISO time, as written (the person's wall clock). */
export const hmOf = (iso: string) => (iso.length > 10 ? iso.slice(11, 16) : "");
/** Minutes since midnight of an ISO time, on its own wall clock. */
export const minutesOf = (iso: string) => (iso.length > 10 ? Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) : 0);

const parts = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** Days from a to b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const pa = parts(a), pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000);
}

/** The offset an ISO time carries, in minutes east of UTC (Z or none: 0). */
export function offsetOf(iso: string): number {
  const m = /([+-])(\d\d):?(\d\d)$/.exec(iso);
  if (!m || iso.length <= 10) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

/** Today's date in a zone (IANA), or at a fixed offset from UTC when there is no zone. */
export function todayIn(zone: string | undefined, now = Date.now(), offsetMin = 0): string {
  if (zone) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
    } catch {
      /* an unknown zone: the offset below */
    }
  }
  return new Date(now + offsetMin * 60_000).toISOString().slice(0, 10);
}

/** Minutes since midnight now, in a zone (the now line). */
export function nowMinutesIn(zone: string, now = Date.now()): number {
  try {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
    const h = Number(p.find((x) => x.type === "hour")?.value ?? 0);
    const m = Number(p.find((x) => x.type === "minute")?.value ?? 0);
    return h * 60 + m;
  } catch {
    const d = new Date(now);
    return d.getHours() * 60 + d.getMinutes();
  }
}

/** 今天 / 明天 / 昨天 (Today / Tomorrow / Yesterday) or "". */
export function relDay(lang: CalLang, ymd: string, today: string): string {
  const k = daysBetween(today, ymd);
  if (k === 0) return lang === "zh" ? "今天" : "Today";
  if (k === 1) return lang === "zh" ? "明天" : "Tomorrow";
  if (k === -1) return lang === "zh" ? "昨天" : "Yesterday";
  return "";
}

/** "11月19日 周四" / "Thu Nov 19" (the year only when it isn't this one). */
export function dateWords(lang: CalLang, ymd: string, today?: string): string {
  const p = parts(ymd);
  const year = today && today.slice(0, 4) !== ymd.slice(0, 4);
  if (lang === "zh") return `${year ? `${p.y}年` : ""}${p.m}月${p.d}日\u00a0${ZH_WD[p.wd]}`;
  return `${EN_WD[p.wd]} ${EN_MON[p.m - 1]} ${p.d}${year ? `, ${p.y}` : ""}`;
}

/** A day card's head: "今天 · 11月18日 周三" / "Today · Wed, Nov 18"; another day "11月20日 周五" / "Fri, Nov 20". */
export function dayHead(lang: CalLang, ymd: string, today: string): string {
  const p = parts(ymd);
  const rel = relDay(lang, ymd, today);
  const year = today.slice(0, 4) !== ymd.slice(0, 4);
  const date = lang === "zh" ? `${year ? `${p.y}年` : ""}${p.m}月${p.d}日\u00a0${ZH_WD[p.wd]}` : `${EN_WD[p.wd]}, ${EN_MON[p.m - 1]} ${p.d}${year ? `, ${p.y}` : ""}`;
  return rel ? `${rel} · ${date}` : date;
}

/** A short date for a run of days: "11月21日–22日" / "Nov 21–22"; across months both in full. */
export function dateRun(lang: CalLang, a: string, b: string): string {
  const pa = parts(a), pb = parts(b);
  if (lang === "zh") return pa.m === pb.m ? `${pa.m}月${pa.d}日–${pb.d}日` : `${pa.m}月${pa.d}日–${pb.m}月${pb.d}日`;
  return pa.m === pb.m ? `${EN_MON[pa.m - 1]} ${pa.d}–${pb.d}` : `${EN_MON[pa.m - 1]} ${pa.d} – ${EN_MON[pb.m - 1]} ${pb.d}`;
}

/** "15:00–15:30". */
export const span = (start: string, end: string) => `${hmOf(start)}–${hmOf(end)}`;

/**
 * When a change happens, in full: "明天 11月19日 周四 15:00–15:30" / "Tomorrow, Thu Nov 19, 15:00–15:30";
 * all day: "明天 11月19日 周四 · 全天" / "Tomorrow, Thu Nov 19, all day". today: the person's date.
 */
export function whenWords(lang: CalLang, start: string, end: string, allDay: boolean | undefined, today: string, allDayWord: string): string {
  const ymd = ymdOf(start);
  const rel = relDay(lang, ymd, today);
  const date = dateWords(lang, ymd, today);
  const time = allDay ? allDayWord : span(start, end);
  if (lang === "zh") return `${rel ? `${rel} ` : ""}${date}${allDay ? " · " : " "}${time}`;
  return `${rel ? `${rel}, ` : ""}${date}, ${allDay ? time.toLowerCase() : time}`;
}

/** Common cities by their zone, in Chinese; anything else by the zone's own city name. */
const ZH_CITY: Record<string, string> = {
  "America/Los_Angeles": "洛杉矶",
  "America/New_York": "纽约",
  "America/Chicago": "芝加哥",
  "America/Denver": "丹佛",
  "America/Toronto": "多伦多",
  "America/Vancouver": "温哥华",
  "America/Sao_Paulo": "圣保罗",
  "America/Mexico_City": "墨西哥城",
  "Europe/London": "伦敦",
  "Europe/Paris": "巴黎",
  "Europe/Berlin": "柏林",
  "Europe/Amsterdam": "阿姆斯特丹",
  "Europe/Madrid": "马德里",
  "Europe/Rome": "罗马",
  "Europe/Zurich": "苏黎世",
  "Europe/Stockholm": "斯德哥尔摩",
  "Europe/Moscow": "莫斯科",
  "Asia/Tokyo": "东京",
  "Asia/Seoul": "首尔",
  "Asia/Shanghai": "上海",
  "Asia/Hong_Kong": "香港",
  "Asia/Taipei": "台北",
  "Asia/Singapore": "新加坡",
  "Asia/Kolkata": "印度",
  "Asia/Dubai": "迪拜",
  "Asia/Bangkok": "曼谷",
  "Australia/Sydney": "悉尼",
  "Australia/Melbourne": "墨尔本",
  "Pacific/Auckland": "奥克兰",
  "Pacific/Honolulu": "檀香山",
};

export function cityOf(lang: CalLang, zone: string): string {
  if (lang === "zh" && ZH_CITY[zone]) return ZH_CITY[zone]!;
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

/** The wall clock of an instant in another zone: { ymd, hm }, or undefined for an unknown zone. */
export function wallIn(zone: string, iso: string): { ymd: string; hm: string } | undefined {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
    const g = (k: string) => p.find((x) => x.type === k)?.value ?? "";
    return { ymd: `${g("year")}-${g("month")}-${g("day")}`, hm: `${g("hour")}:${g("minute")}` };
  } catch {
    return undefined;
  }
}

/** Whether an instant's wall clock in that zone differs from the one written in the ISO string. */
export function zoneDiffers(zone: string, iso: string): boolean {
  const w = wallIn(zone, iso);
  return !!w && (w.ymd !== ymdOf(iso) || w.hm !== hmOf(iso));
}

/** "当地 11月17日 21:00 · 洛杉矶" / "21:00 Nov 17 in Los Angeles", or "" when the zone says the same. */
export function otherZoneLine(lang: CalLang, zone: string, iso: string): string {
  if (!zoneDiffers(zone, iso)) return "";
  const w = wallIn(zone, iso)!;
  const p = parts(w.ymd);
  const city = cityOf(lang, zone);
  return lang === "zh" ? `当地 ${p.m}月${p.d}日 ${w.hm} · ${city}` : `${w.hm} ${EN_MON[p.m - 1]} ${p.d} in ${city}`;
}

/** The other side's time on a change card, as { when, city }: "11月19日 周四 00:00" / "00:00 Thu Nov 19". */
export function theirSide(lang: CalLang, zone: string, iso: string): { when: string; city: string } | undefined {
  if (!zoneDiffers(zone, iso)) return undefined;
  const w = wallIn(zone, iso)!;
  const date = dateWords(lang, w.ymd);
  return { when: lang === "zh" ? `${date} ${w.hm}` : `${w.hm} ${date}`, city: cityOf(lang, zone) };
}

/** Names in a list: "Lina Chen、alice" / "Lina Chen, alice". */
export const nameList = (lang: CalLang, names: string[]) => names.join(lang === "zh" ? "、" : ", ");

/** Who else is on it: "和 Lina Chen、alice" / "with Lina Chen, alice"; more than named: "等 5 人" / "+3". */
export function peopleWords(lang: CalLang, people: number | undefined, names: string[] | undefined): string {
  const n = people ?? names?.length ?? 0;
  const w = names ?? [];
  if (!n) return "";
  if (!w.length) return lang === "zh" ? `和 ${n} 个人` : n === 1 ? "with 1 other" : `with ${n} others`;
  const more = n - w.length;
  if (lang === "zh") return `和 ${nameList(lang, w)}${more > 0 ? ` 等 ${n} 人` : ""}`;
  return `with ${nameList(lang, w)}${more > 0 ? ` +${more}` : ""}`;
}
