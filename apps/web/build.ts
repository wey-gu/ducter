// Builds the phone client into apps/web/static (committed, so core serves it with no build step
// and the compiled `ducter` binary embeds it). `bun run apps/web/build.ts`; test/build.test.ts
// fails when the committed bundle is older than src.
import { join } from "node:path";

const here = import.meta.dir;

export async function buildWeb(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [entry, name] of [
    ["src/main.tsx", "app.js"],
    ["src/sw.ts", "sw.js"],
  ] as const) {
    const r = await Bun.build({
      entrypoints: [join(here, entry)],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
      tsconfig: join(here, "tsconfig.json"),
      define: { "process.env.NODE_ENV": '"production"' },
    });
    if (!r.success) throw new AggregateError(r.logs, `build of ${entry} failed`);
    out[name] = await r.outputs[0]!.text();
  }
  return out;
}

if (import.meta.main) {
  const files = await buildWeb();
  for (const [name, text] of Object.entries(files)) {
    await Bun.write(join(here, "static", name), text);
    console.log(`apps/web/static/${name}  ${(text.length / 1024).toFixed(1)} KB`);
  }
}
