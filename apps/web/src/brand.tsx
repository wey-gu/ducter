// D314: a third-party product is shown by its own mark, drawn faithfully and small inside a clay
// tile. The SVGs in ./brand are the one source (the Mac embeds byte-equal copies,
// apps/desktop/internal/theme/brand_test.go); their ink parts are currentColor, so they turn
// light on the dark paper as the owners' own marks do. Each file says where its mark comes from;
// design/art/LOGOS.md has the usage notes. Nowledge Mem's mark is its app icon, a picture.
import { useMemo } from "preact/hooks";
import cline from "./brand/cline.svg" with { type: "text" };
import cursor from "./brand/cursor.svg" with { type: "text" };
import discord from "./brand/discord.svg" with { type: "text" };
import gemini from "./brand/gemini.svg" with { type: "text" };
import github from "./brand/github.svg" with { type: "text" };
import gmail from "./brand/gmail.svg" with { type: "text" };
import googlecalendar from "./brand/googlecalendar.svg" with { type: "text" };
import imessage from "./brand/imessage.svg" with { type: "text" };
import oomol from "./brand/oomol.svg" with { type: "text" };
import raycast from "./brand/raycast.svg" with { type: "text" };
import slack from "./brand/slack.svg" with { type: "text" };
import telegram from "./brand/telegram.svg" with { type: "text" };
import tuwa from "./brand/tuwa.svg" with { type: "text" };
import wechat from "./brand/wechat.svg" with { type: "text" };
import windsurf from "./brand/windsurf.svg" with { type: "text" };
import zed from "./brand/zed.svg" with { type: "text" };

// The marks; a gradient's id is made unique per drawn copy (BrandMark).
const SVGS: Record<string, string> = { cline, cursor, discord, gemini, github, gmail, googlecalendar, imessage, oomol, raycast, slack, telegram, tuwa, wechat, windsurf, zed };

let seq = 0;

/** The product mark a service is shown by, "" for one Ducter has no faithful mark of. */
export function brandOf(service: string): string {
  if (service === "gmail") return "gmail";
  if (service === "googlecalendar" || service === "google_calendar") return "googlecalendar";
  if (service === "github") return "github";
  if (service.startsWith("slack")) return "slack";
  if (service.startsWith("discord")) return "discord";
  if (service === "telegram") return "telegram";
  return "";
}

/** Another AI tool's mark by the name Mem gives it (mem-source.ts), "" for one with no mark here. */
export function toolBrand(from: string): string {
  return ({ Cursor: "cursor", Cline: "cline", Windsurf: "windsurf", Gemini: "gemini", "Gemini CLI": "gemini", Zed: "zed", Raycast: "raycast" } as Record<string, string>)[from] ?? "";
}

/** A product's mark at `size` (24 inside a tile), or nothing for an unknown name. */
export function BrandMark({ name, size = 24 }: { name: string; size?: number }) {
  const n = useMemo(() => ++seq, []);
  if (name === "nowledge_mem") return <img class="brand-icon" src="app/art/nowledge_mem.webp" width={size} height={size} alt="" />;
  const svg = SVGS[name];
  if (!svg) return null;
  const html = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/id="([\w-]+)"/g, `id="$1-${n}"`).replace(/url\(#([\w-]+)\)/g, `url(#$1-${n})`);
  return <span class="brand-mark" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A product's mark in the 40 tile column: on the small white clay tile, or (an app icon) as the tile itself. */
export function BrandTile({ name, faded }: { name: string; faded?: boolean }) {
  if (name === "nowledge_mem") {
    return (
      <span class={`g-tile brand-app${faded ? " faded" : ""}`} aria-hidden="true">
        <BrandMark name={name} size={40} />
      </span>
    );
  }
  return (
    <span class={`g-tile mark brand${faded ? " faded" : ""}`} aria-hidden="true">
      <BrandMark name={name} />
    </span>
  );
}
