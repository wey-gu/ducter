// The one-line installer (apps/site/public/install.sh, served as https://ducter.ai/install.sh)
// downloads release files by name. Those names are made by .github/workflows/release.yml; if
// either side renames a file, every `curl … | sh` breaks, so this test holds them together.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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

// The bundle's own install.sh refuses flags it doesn't know, so the Mac-only --no-cli is dropped
// before Linux forwards the rest (`sh -s -- --no-cli --service` on a server).
test("Linux drops the Mac's --no-cli and forwards the other arguments as they are", () => {
  const line = installer.split("\n").find((l) => l.includes('[ "$a" = --no-cli ]'));
  expect(line).toBeDefined();
  const out = spawnSync("sh", ["-c", `${line}\nprintf '%s|' "$@"`, "sh", "--no-cli", "--service", "a b", "--no-cli"]).stdout.toString();
  expect(out).toBe("--service|a b|");
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

// The Mac path links ~/.local/bin/ducter to the app's CLI, with the app's own LinkCLI rules
// (apps/desktop/internal/local/shell.go). Run link_cli alone: the script without its last line.
describe("link_cli", () => {
  const body = installer.replace(/\nmain "\$@"\n?$/, "\n");
  const run = (bin: string, cli: string, path = "/usr/bin:/bin") => {
    const r = spawnSync("sh", ["-c", `${body}\nlink_cli "$1"`, "sh", cli], {
      env: { HOME: dirname(bin), PATH: path, DUCTER_BIN_DIR: bin, SHELL: "/bin/zsh" },
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    return r.stdout;
  };
  const setup = () => {
    const d = mkdtempSync(join(tmpdir(), "ducter-link-"));
    const cli = join(d, "Ducter.app/Contents/Helpers/ducter");
    mkdirSync(dirname(cli), { recursive: true });
    writeFileSync(cli, "#!/bin/sh\n", { mode: 0o755 });
    return { d, cli, bin: join(d, "bin"), link: join(d, "bin/ducter") };
  };

  test("the bundle still has its CLI where the link points", () => {
    expect(readFileSync(join(root, "scripts/make-app.sh"), "utf8")).toContain('"$APP/Contents/Helpers/ducter"');
    expect(installer).toContain('link_cli "$dest/Contents/Helpers/ducter"');
  });

  test("links when nothing is there, and says how to reach it off PATH", () => {
    const { d, cli, bin, link } = setup();
    const out = run(bin, cli);
    expect(readlinkSync(link)).toBe(cli);
    expect(out).toContain("is on PATH in new terminals (~/.zshrc)");
    expect(out).toContain(`export PATH="${bin}:$PATH"`);
    expect(readFileSync(join(d, ".zshrc"), "utf8")).toContain('export PATH="$HOME/bin:$PATH"');
    expect(run(bin, cli, `${bin}:/usr/bin:/bin`)).toContain("already linked");
    rmSync(d, { recursive: true });
  });

  test("replaces a link into another Ducter.app", () => {
    const { d, cli, bin, link } = setup();
    mkdirSync(bin);
    symlinkSync("/Applications/Old/Ducter.app/Contents/Helpers/ducter", link);
    run(bin, cli, `${bin}:/usr/bin:/bin`);
    expect(readlinkSync(link)).toBe(cli);
    rmSync(d, { recursive: true });
  });

  test("leaves a regular file or another tool's link alone", () => {
    const { d, cli, bin, link } = setup();
    mkdirSync(bin);
    symlinkSync("/opt/homebrew/bin/other", link);
    expect(run(bin, cli)).toContain("left alone");
    expect(readlinkSync(link)).toBe("/opt/homebrew/bin/other");
    rmSync(link);
    writeFileSync(link, "mine");
    expect(run(bin, cli)).toContain("left alone");
    expect(readFileSync(link, "utf8")).toBe("mine");
    rmSync(d, { recursive: true });
  });
});

// Both installers put ~/.local/bin on PATH the same way: one marked block in the shell's profile,
// added once however often they run, which `ducter uninstall --all` takes out again.
describe("add_path_rc", () => {
  const fn = (src: string) => /\nadd_path_rc\(\) \{\n[\s\S]*?\n\}\n/.exec(src)![0];
  for (const [name, src] of [["install.sh", installer], ["scripts/install.sh", bundler]] as const) {
    test(`${name}: once per profile, the right profile per shell`, async () => {
      const { stripRcBlock } = await import("../packages/cli/src/uninstall.ts");
      const home = mkdtempSync(join(tmpdir(), "ducter-rc-"));
      try {
        const add = (shell: string) =>
          spawnSync("sh", ["-c", `${fn(src)}\nadd_path_rc "$HOME/.local/bin" && echo "$RC"`], { env: { HOME: home, SHELL: shell, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
        writeFileSync(join(home, ".bashrc"), "alias ll='ls -l'\n");
        for (let i = 0; i < 3; i++) expect(add("/bin/bash").stdout.trim()).toMatch(/\.bash(rc|_profile)$/);
        const rc = add("/bin/bash").stdout.trim();
        const text = readFileSync(rc, "utf8");
        expect(text.match(/# added by Ducter/g)?.length).toBe(1);
        expect(text).toContain('export PATH="$HOME/.local/bin:$PATH"');
        if (rc.endsWith(".bashrc")) expect(stripRcBlock(text)).toBe("alias ll='ls -l'\n");
        expect(add("/usr/bin/fish").stdout.trim()).toBe(join(home, ".config/fish/config.fish"));
        expect(readFileSync(join(home, ".config/fish/config.fish"), "utf8")).toContain('set -gx PATH "$HOME/.local/bin" $PATH');
        expect(add("/bin/zsh").stdout.trim()).toBe(join(home, ".zshrc"));
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    });
  }
  test("the bundle's install.sh links /usr/local/bin only as root or when writable, and never over another file", () => {
    expect(bundler).toContain('if [ "$(id -u)" != 0 ] && [ ! -w "$g" ]; then return 1; fi');
    expect(bundler).toContain('[ -e "$g/ducter" ] && [ ! -L "$g/ducter" ] && return 1');
    // No user-facing pointer to a script that isn't in the bundle.
    expect(bundler).not.toContain("caddy-setup");
    expect(installer).not.toContain("caddy-setup");
  });
});
