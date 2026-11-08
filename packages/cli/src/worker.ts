// `ducter worker --join <url> --code <code>`: this machine runs tasks for a main process
// elsewhere. See docs/design/system.md "Workers" for the design and what ships tonight.
import type { Args } from "./args.ts";
import type { Style } from "./doctor.ts";
import type { T } from "./i18n.ts";

export async function cmdWorker(o: { t: T; style: Style; args: Args; dataDir: string }): Promise<number> {
  console.log(o.t("worker.notYet"));
  return 2;
}
