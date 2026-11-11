// A folder a task used on a computer this home no longer knows ("/Users/weyl" on
// "Siweis-MacBook-Pro", 2026-11-11) isn't offered by New task: it couldn't start there, and on the
// phone it was the only folder listed. An away worker's folders stay listed.
import { expect, test } from "bun:test";
import { newTaskOptions, type NewTaskDeps } from "../src/newtask.ts";

const card = (place: unknown, openedAt: string) => ({ taskId: openedAt, place, openedAt }) as never;

test("places on unknown computers are left out; an away worker's stay", async () => {
  const d = {
    dataDir: "/nonexistent",
    tasks: {
      list: () => [
        card({ kind: "folder", device: "Siweis-MacBook-Pro", path: "/Users/weyl" }, "2026-11-10T12:00:00.000Z"),
        card({ kind: "folder", device: "wmac", path: "/Users/weyl/notes" }, "2026-11-09T12:00:00.000Z"),
        card({ kind: "folder", device: "local", path: "/root/work" }, "2026-11-08T12:00:00.000Z"),
      ],
    },
    computers: {
      nameOf: (dev: string) => (dev === "wmac" ? "Macbook Pro M3" : undefined),
      homeName: () => "hel",
      workers: () => [{ id: "wmac", name: "Macbook Pro M3", online: false }],
      folderInfo: async () => "offline" as const,
    },
    found: { get: async () => [], folder: () => undefined, forget() {} },
  } as unknown as NewTaskDeps;
  const { places } = await newTaskOptions(d);
  const paths = places.map((p) => (p.place.kind === "folder" ? p.place.path : p.place.kind));
  expect(paths).toEqual(["/Users/weyl/notes", "/root/work", "none"]);
});
