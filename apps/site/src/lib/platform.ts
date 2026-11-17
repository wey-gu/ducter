// Which device the download page is open on (D319), from what the browser says about itself.
// An iPad asks for desktop pages and calls itself a Mac; its touch screen gives it away.
export type OS = "mac" | "linux" | "ios" | "android" | "other";

export function detect(ua: string, platform: string, touchPoints: number): { os: OS; ipad: boolean } {
  if (/Android/i.test(ua)) return { os: "android", ipad: false };
  if (/iPhone|iPod/.test(ua + platform)) return { os: "ios", ipad: false };
  if (/iPad/.test(ua + platform) || (/Macintosh/.test(ua) && touchPoints > 1)) return { os: "ios", ipad: true };
  if (/Mac/i.test(platform) || /Macintosh/.test(ua)) return { os: "mac", ipad: false };
  if (/CrOS/.test(ua) || /Win/i.test(platform) || /Windows/.test(ua)) return { os: "other", ipad: false };
  if (/Linux|X11/i.test(platform + ua)) return { os: "linux", ipad: false };
  return { os: "mac", ipad: false };
}
