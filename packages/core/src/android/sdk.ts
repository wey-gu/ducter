// Ducter's phone (D217, research/62): an Android emulator Ducter installs into its own data dir
// and runs headless. No Android Studio, no Java, no sdkmanager: the three Google packages it
// needs are pinned here by version, size and SHA-1 (the checksums Google's own repository lists),
// downloaded from dl.google.com, checked, and unpacked in the SDK's own layout. The phone itself
// is one AVD whose config Ducter writes.
//
// Nothing goes to the user's own SDK (~/Library/Android/sdk), ~/.android or their adb: every
// tool runs with ANDROID_* pointed inside <dataDir>/phone and adb on a server port of its own.
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Exec = (argv: string[], opts?: { timeoutMs?: number; env?: Record<string, string> }) => Promise<{ code: number; out: string }>;

export const REPO = "https://dl.google.com/android/repository";

export interface SdkPackage {
  /** The SDK path it unpacks to (its folder under the SDK root). */
  path: string;
  /** What the person reads in the install sheet. */
  label: { zh: string; en: string };
  version: string;
  url: string;
  size: number; // bytes, as Google's repository lists it
  sha1: string;
  license: "android-sdk-license" | "android-sdk-arm-dbt-license";
  /** The folder inside the zip that becomes `path`. */
  top: string;
}

/**
 * Pinned 2026-11-12 from repository2-3.xml and sys-img/google_apis_playstore/sys-img2-3.xml
 * (stable channel). Android 16 (API 36) with Google Play, arm64: Apple Silicon runs it natively.
 * Changing one is a deliberate change: new version, size and checksum together.
 */
export const MAC_ARM64: SdkPackage[] = [
  {
    path: "platform-tools",
    label: { zh: "安卓的连接工具", en: "Android's connection tools" },
    version: "37.0.1",
    url: `${REPO}/platform-tools_r37.0.1-darwin.zip`,
    size: 16_110_554,
    sha1: "6ae73f4de6452dc57e62ec02b68eed92a4c21661",
    license: "android-sdk-license",
    top: "platform-tools",
  },
  {
    path: "emulator",
    label: { zh: "安卓模拟器", en: "The Android emulator" },
    version: "37.2.13",
    url: `${REPO}/emulator-darwin_aarch64-16740729.zip`,
    size: 416_113_219,
    sha1: "6c5e61b873e11c7d1d08683bea089f762baee070",
    license: "android-sdk-license",
    top: "emulator",
  },
  {
    path: "system-images/android-36/google_apis_playstore/arm64-v8a",
    label: { zh: "安卓 16（带 Google Play）", en: "Android 16 with Google Play" },
    version: "36 r07",
    url: `${REPO}/sys-img/google_apis_playstore/arm64-v8a-36_r07.zip`,
    size: 1_886_527_965,
    sha1: "5b91ef80a5eb60d7b7167528db259c2a12d20e9c",
    license: "android-sdk-arm-dbt-license",
    top: "arm64-v8a",
  },
];

/** Where Google's repository keeps each license's text (shown in the install sheet, accepted once). */
export const LICENSE_SOURCE: Record<SdkPackage["license"], string> = {
  "android-sdk-license": `${REPO}/repository2-3.xml`,
  "android-sdk-arm-dbt-license": `${REPO}/sys-img/google_apis_playstore/sys-img2-3.xml`,
};

/** On disk once the phone has run (research/62 §5): the tools and Android (3.6 GB), the phone's storage after its first start (3 GB) and its quick-start snapshot (3 GB). */
export const DISK_BYTES = 10_000_000_000;

/** The packages for this computer, or why it can't have Ducter's phone yet. */
export function packagesFor(platform: string = process.platform, arch: string = process.arch): { ok: true; packages: SdkPackage[] } | { ok: false; why: "not_mac_arm" } {
  // Phase 1 (D217): Apple Silicon Macs. An Intel Mac or Linux server is a later phase.
  if (platform === "darwin" && arch === "arm64") return { ok: true, packages: MAC_ARM64 };
  return { ok: false, why: "not_mac_arm" };
}

export const downloadBytes = (pkgs: SdkPackage[]) => pkgs.reduce((n, p) => n + p.size, 0);

export interface PhoneDirs {
  root: string; // <dataDir>/phone
  sdk: string; // ANDROID_SDK_ROOT
  home: string; // ANDROID_USER_HOME (and the emulator's home)
  avd: string; // ANDROID_AVD_HOME
  dl: string; // downloads in flight (removed after unpacking)
}

export function phoneDirs(dataDir: string): PhoneDirs {
  const root = join(dataDir, "phone");
  return { root, sdk: join(root, "sdk"), home: join(root, "home"), avd: join(root, "home", "avd"), dl: join(root, "dl") };
}

/** adb's own server port for Ducter's phone, never the user's 5037. */
export const ADB_PORT = 5137;
/** The emulator's console port (its adb serial is emulator-<port>). */
export const CONSOLE_PORT = 5560;
export const AVD_NAME = "ducter";

/** Everything the Android tools see: inside Ducter's folder only. */
export function androidEnv(d: PhoneDirs, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const adbPort = String(Number(env.DUCTER_PHONE_ADB_PORT) || ADB_PORT);
  return {
    ANDROID_SDK_ROOT: d.sdk,
    ANDROID_HOME: d.sdk,
    ANDROID_USER_HOME: d.home,
    ANDROID_EMULATOR_HOME: d.home,
    ANDROID_AVD_HOME: d.avd,
    ANDROID_ADB_SERVER_PORT: adbPort,
  };
}

export const adbBin = (d: PhoneDirs) => join(d.sdk, "platform-tools", "adb");
export const emulatorBin = (d: PhoneDirs) => join(d.sdk, "emulator", "emulator");

/** The AVD's config: a mid-size phone with Google Play, kept small enough to stay light (research/62 §5). */
export function avdConfig(sysdir: string): string {
  return [
    `AvdId=${AVD_NAME}`,
    "avd.ini.displayname=Ducter",
    "avd.ini.encoding=UTF-8",
    "abi.type=arm64-v8a",
    "hw.cpu.arch=arm64",
    "hw.cpu.ncore=2",
    "hw.ramSize=3072",
    "vm.heapSize=256",
    `image.sysdir.1=${sysdir}/`,
    "tag.id=google_apis_playstore",
    "tag.display=Google Play",
    "PlayStore.enabled=true",
    "target=android-36",
    "hw.lcd.width=720",
    "hw.lcd.height=1600",
    "hw.lcd.density=320",
    "hw.keyboard=yes",
    "hw.mainKeys=no",
    "hw.gpu.enabled=yes",
    "hw.gpu.mode=auto",
    "hw.audioInput=no",
    "hw.audioOutput=no",
    "hw.camera.back=none",
    "hw.camera.front=none",
    "disk.dataPartition.size=6G",
    "fastboot.forceColdBoot=no",
    "fastboot.forceFastBoot=yes",
    "showDeviceFrame=no",
    "",
  ].join("\n");
}

/** Writes the AVD (its .ini and config.ini); keeps an existing one (the person's apps and sign-ins). */
export function writeAvd(d: PhoneDirs, pkgs: SdkPackage[]): void {
  const dir = join(d.avd, `${AVD_NAME}.avd`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(d.avd, `${AVD_NAME}.ini`), `avd.ini.encoding=UTF-8\npath=${dir}\npath.rel=avd/${AVD_NAME}.avd\ntarget=android-36\n`);
  const img = pkgs.find((p) => p.path.startsWith("system-images/"))!;
  if (!existsSync(join(dir, "config.ini"))) writeFileSync(join(dir, "config.ini"), avdConfig(img.path));
}

export interface Installed {
  packages: { path: string; version: string }[];
  licenses: { id: string; sha256: string }[];
  at: string;
}

export function readInstalled(d: PhoneDirs): Installed | undefined {
  try {
    const j = JSON.parse(readFileSync(join(d.root, "installed.json"), "utf8"));
    if (Array.isArray(j?.packages) && existsSync(adbBin(d)) && existsSync(emulatorBin(d))) return j;
  } catch {
    /* none */
  }
  return undefined;
}

/** A license's text from Google's repository XML (the same words sdkmanager shows). */
export function licenseFromXml(xml: string, id: string): string | undefined {
  const m = xml.match(new RegExp(`<license id="${id}"[^>]*>([\\s\\S]*?)</license>`));
  if (!m) return undefined;
  return m[1]!
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface License {
  id: SdkPackage["license"];
  title: { zh: string; en: string };
  text: string;
  sha256: string;
}

const LICENSE_TITLE: Record<SdkPackage["license"], { zh: string; en: string }> = {
  "android-sdk-license": { zh: "Android SDK 许可协议", en: "Android SDK License Agreement" },
  "android-sdk-arm-dbt-license": { zh: "Android 系统映像许可协议（带 Google Play）", en: "Android system image license (with Google Play)" },
};

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** The licenses the packages come under, with their text as Google publishes it today. */
export async function licenses(pkgs: SdkPackage[], fetcher: Fetcher = fetch): Promise<License[]> {
  const ids = [...new Set(pkgs.map((p) => p.license))];
  const out: License[] = [];
  const xmls = new Map<string, string>();
  for (const id of ids) {
    const src = LICENSE_SOURCE[id];
    if (!xmls.has(src)) {
      const r = await fetcher(src);
      if (!r.ok) throw new Error(`couldn't read Google's license list (${r.status})`);
      xmls.set(src, await r.text());
    }
    const text = licenseFromXml(xmls.get(src)!, id);
    if (!text) throw new Error(`Google's list has no ${id}`);
    out.push({ id, title: LICENSE_TITLE[id], text, sha256: sha256(text) });
  }
  return out;
}

export type InstallStep = { step: "download"; done: number; total: number } | { step: "unpack"; package: string } | { step: "phone" };

export type InstallResult = { ok: true } | { ok: false; reason: "license" | "space" | "failed"; message: string };

export interface InstallOptions {
  dataDir: string;
  packages: SdkPackage[];
  /** The licenses the person accepted in the sheet, by id and the sha256 of the text they saw. */
  accepted: { id: string; sha256: string }[];
  /** The texts as they are now: an acceptance of another text is not an acceptance. */
  current: License[];
  onStep?: (s: InstallStep) => void;
  fetcher?: Fetcher;
  exec?: Exec;
  /** Free bytes where the data dir is (tests). */
  free?: () => Promise<number>;
}

const defaultExec: Exec = async (argv, o = {}) => {
  try {
    const p = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", stdin: "ignore", ...(o.env ? { env: { ...process.env, ...o.env } } : {}) });
    const timer = o.timeoutMs ? setTimeout(() => p.kill(), o.timeoutMs) : undefined;
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (timer) clearTimeout(timer);
    return { code, out: [out.trim(), err.trim()].filter(Boolean).join("\n") };
  } catch (e) {
    return { code: -1, out: (e as Error).message };
  }
};

async function freeBytes(dir: string, exec: Exec): Promise<number> {
  const r = await exec(["df", "-k", dir], { timeoutMs: 5_000 });
  const cols = r.out.trim().split("\n").pop()?.trim().split(/\s+/) ?? [];
  const kb = Number(cols[3]);
  return Number.isFinite(kb) ? kb * 1024 : Number.POSITIVE_INFINITY;
}

/** Downloads one package with progress, checking its size and SHA-1 on the way. */
async function download(p: SdkPackage, to: string, fetcher: Fetcher, progress: (n: number) => void): Promise<void> {
  if (existsSync(to) && statSync(to).size === p.size) {
    // A finished download from an earlier try: check it, don't fetch it again.
    const h = createHash("sha1");
    const f = Bun.file(to).stream().getReader();
    for (;;) {
      const { done, value } = await f.read();
      if (done) break;
      h.update(value);
    }
    if (h.digest("hex") === p.sha1) return progress(p.size);
    rmSync(to, { force: true });
  }
  const r = await fetcher(p.url);
  if (!r.ok || !r.body) throw new Error(`download of ${p.path} failed (${r.status})`);
  const part = `${to}.part`;
  const out = createWriteStream(part);
  const h = createHash("sha1");
  let n = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    h.update(value);
    n += value.byteLength;
    if (!out.write(value)) await new Promise<void>((res) => out.once("drain", () => res()));
    progress(n);
  }
  await new Promise<void>((res, rej) => out.end((e?: Error | null) => (e ? rej(e) : res())));
  const sum = h.digest("hex");
  if (n !== p.size || sum !== p.sha1) {
    rmSync(part, { force: true });
    throw new Error(`${p.path} didn't arrive intact (expected ${p.sha1}, got ${sum}); nothing was installed`);
  }
  renameSync(part, to);
}

/**
 * Install Ducter's phone: refuses without the licenses accepted as they read now, and without
 * room; downloads, checks, unpacks each package into the SDK layout, writes the AVD, and records
 * what it installed and which licenses the person accepted.
 */
export async function installPhone(o: InstallOptions): Promise<InstallResult> {
  const d = phoneDirs(o.dataDir);
  const exec = o.exec ?? defaultExec;
  const fetcher = o.fetcher ?? fetch;
  for (const l of o.current) {
    if (!o.accepted.some((a) => a.id === l.id && a.sha256 === l.sha256)) return { ok: false, reason: "license", message: `the ${l.title.en} wasn't accepted` };
  }
  mkdirSync(d.dl, { recursive: true });
  const need = downloadBytes(o.packages) + DISK_BYTES;
  const free = await (o.free ?? (() => freeBytes(d.root, exec)))();
  if (free < need) return { ok: false, reason: "space", message: `${Math.ceil(need / 1e9)} GB free is needed, ${Math.floor(free / 1e9)} GB is free` };
  try {
    const total = downloadBytes(o.packages);
    let before = 0;
    const zips: string[] = [];
    for (const p of o.packages) {
      const zip = join(d.dl, p.url.split("/").pop()!);
      await download(p, zip, fetcher, (n) => o.onStep?.({ step: "download", done: before + n, total }));
      before += p.size;
      zips.push(zip);
    }
    for (const [i, p] of o.packages.entries()) {
      o.onStep?.({ step: "unpack", package: p.path });
      const dest = join(d.sdk, p.path);
      const tmp = join(d.sdk, ".unpack");
      rmSync(tmp, { recursive: true, force: true });
      mkdirSync(tmp, { recursive: true });
      const r = await exec(["/usr/bin/unzip", "-q", "-o", zips[i]!, "-d", tmp], { timeoutMs: 20 * 60_000 });
      if (r.code !== 0) throw new Error(`couldn't unpack ${p.path}: ${r.out.slice(0, 200)}`);
      const top = existsSync(join(tmp, p.top)) ? join(tmp, p.top) : join(tmp, readdirSync(tmp)[0] ?? "");
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(join(dest, ".."), { recursive: true });
      renameSync(top, dest);
      rmSync(tmp, { recursive: true, force: true });
      rmSync(zips[i]!, { force: true }); // the zip is several GB; only the unpacked package stays
    }
    o.onStep?.({ step: "phone" });
    mkdirSync(join(d.sdk, "platforms"), { recursive: true }); // the emulator looks for it
    writeAvd(d, o.packages);
    const rec: Installed = { packages: o.packages.map((p) => ({ path: p.path, version: p.version })), licenses: o.current.map((l) => ({ id: l.id, sha256: l.sha256 })), at: new Date().toISOString() };
    writeFileSync(join(d.root, "installed.json"), JSON.stringify(rec, null, 2) + "\n");
    rmSync(d.dl, { recursive: true, force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: "failed", message: (e as Error).message };
  }
}

/** 抹掉 / Erase: the phone's apps, sign-ins and data (the AVD). keepSdk: the tools stay for a fresh phone. */
export function erasePhone(dataDir: string, o: { keepSdk: boolean }): void {
  const d = phoneDirs(dataDir);
  if (o.keepSdk) {
    rmSync(d.avd, { recursive: true, force: true });
    const inst = readInstalled(d);
    if (inst) writeAvd(d, MAC_ARM64.filter((p) => inst.packages.some((x) => x.path === p.path)));
    return;
  }
  rmSync(d.root, { recursive: true, force: true });
}
