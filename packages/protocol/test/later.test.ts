// D382: the offered times, on the cases the Mac app's port reads too.
import { expect, test } from "bun:test";
import fixture from "../fixtures/later.json";
import { laterChoices } from "../src/later.ts";

const local = (s: string) => {
  const [d, t] = s.split(" ");
  const [y, mo, da] = d!.split("-").map(Number);
  const [h, mi] = t!.split(":").map(Number);
  return new Date(y!, mo! - 1, da!, h!, mi!);
};
const show = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

for (const c of fixture.cases)
  test(`later choices at ${c.now} (morning ${c.morning})`, () => {
    const got = laterChoices(local(c.now), c.morning).map((x) => (x.today ? [x.key, show(x.at), "today"] : [x.key, show(x.at)]));
    expect(got).toEqual(c.want);
  });
