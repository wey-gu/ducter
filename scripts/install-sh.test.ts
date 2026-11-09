// The one-line installer (apps/site/public/install.sh, served as https://ducter.ai/install.sh)
// downloads release files by name. Those names are made by .github/workflows/release.yml; if
// either side renames a file, every `curl … | sh` breaks, so this test holds them together.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const release = readFileSync(join(root, ".github/workflows/release.yml"), "utf8");
const installer = readFileSync(join(root, "apps/site/public/install.sh"), "utf8");
const bundler = readFileSync(join(root, "scripts/install.sh"), "utf8");

test("release.yml still names the files the installer downloads", () => {
  expect(release).toContain('version="${GITHUB_REF_NAME#v}"'); // tag v<version>
  expect(release).toContain("Ducter-$VERSION-arm64.dmg");
  expect(release).toContain('name="ducter-$VERSION-linux-$arch"');
  expect(release).toContain('"$RUNNER_TEMP/upload/$name.tar.gz" "$name"'); // one folder per tarball
  expect(release).toMatch(/for arch in arm64 x64; do/);
  expect(release).toContain("sha256sum -- * >SHA256SUMS.txt");
  expect(bundler).toContain('cp "$0" "$LINUX/linux-$arch/install.sh"'); // the folder holds install.sh
});

test("install.sh asks for exactly those names", () => {
  expect(installer).toContain("releases/download/v$VERSION");
  expect(installer).toContain('dmg="Ducter-$VERSION-arm64.dmg"');
  expect(installer).toContain('name="ducter-$VERSION-linux-$arch"');
  expect(installer).toContain('"$BASE/$name.tar.gz"');
  expect(installer).toContain('"$TMP/$name/install.sh"');
  expect(installer).toContain("SHA256SUMS.txt");
  expect(installer).toMatch(/arch=x64/);
  expect(installer).toMatch(/arch=arm64/);
});
