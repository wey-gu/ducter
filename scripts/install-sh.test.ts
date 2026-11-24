// The one-line installer (apps/site/public/install.sh, served as https://ducter.ai/install.sh)
// downloads release files by name. Those names are made by .github/workflows/release.yml; if
// either side renames a file, every `curl … | sh` breaks, so this test holds them together.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

// D318: the bundle's install without --service names the tailnet when this server is in one.
describe("the next step on a server in a tailnet", () => {
  const block = bundler.slice(bundler.indexOf('  TS_NAME=""'), bundler.indexOf('  if [ -n "$TS_NAME" ]'));
  const name = (status: string | null) => {
    const d = mkdtempSync(join(tmpdir(), "ducter-ts-sh-"));
    try {
      if (status !== null) writeFileSync(join(d, "tailscale"), `#!/bin/sh\ncat <<'J'\n${status}\nJ\n`, { mode: 0o755 });
      const r = spawnSync("sh", ["-c", `${block}\nprintf '%s' "$TS_NAME"`], { env: { PATH: `${d}:/usr/bin:/bin` }, encoding: "utf8" });
      expect(r.status).toBe(0);
      return r.stdout;
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };
  const status = (state: string) =>
    JSON.stringify({ BackendState: state, Self: { DNSName: "hel.tail1234.ts.net.", HostName: "hel" }, Peer: { k: { DNSName: "mac.tail1234.ts.net." } } }, null, 2);
  test("running: this server's own name, without its dot", () => expect(name(status("Running"))).toBe("hel.tail1234.ts.net"));
  test("signed out, or no Tailscale: nothing", () => {
    expect(name(status("NeedsLogin"))).toBe("");
    expect(name(null)).toBe("");
  });
});

// D347: `sh -s -- worker <address> --code <code>`, the line Lend a computer shows: it checks the
// home is reachable, keeps an install already at this version, then runs `ducter worker … --service`.
describe("worker mode", () => {
  const run = (args: string[], o: { reach?: boolean; version?: string } = {}) => {
    const d = mkdtempSync(join(tmpdir(), "ducter-lend-sh-"));
    try {
      const bin = join(d, "fakebin");
      mkdirSync(bin, { recursive: true });
      // curl: /health answers (or not); nothing else is fetched when the version is already here.
      writeFileSync(join(bin, "curl"), `#!/bin/sh\ncase "$*" in *"/health"*) exit ${o.reach === false ? 7 : 0} ;; esac\necho "unexpected curl $*" >&2; exit 9\n`, { mode: 0o755 });
      const ducter = `#!/bin/sh\nif [ "$1" = version ]; then echo "ducter ${o.version ?? "9.9.9"} (x, bun 1, linux-x64)"; exit 0; fi\nprintf '%s|' "$@" >"${d}/args"\n`;
      for (const p of [join(d, "prefix/bin/ducter"), join(d, "apps/Ducter.app/Contents/Helpers/ducter")]) {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, ducter, { mode: 0o755 });
      }
      const r = spawnSync("sh", ["-s", "--", ...args], {
        input: installer,
        env: { HOME: d, PATH: `${bin}:/usr/bin:/bin:/usr/sbin`, DUCTER_VERSION: "9.9.9", DUCTER_PREFIX: join(d, "prefix"), DUCTER_APP_DIR: join(d, "apps"), DUCTER_NO_OPEN: "1" },
        encoding: "utf8",
      });
      let called = "";
      try {
        called = readFileSync(join(d, "args"), "utf8");
      } catch {}
      return { status: r.status, out: r.stdout + r.stderr, called };
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  test("this version already here: no download; joins with the code and installs the service", () => {
    const r = run(["worker", "hel.example.com/", "--code", "K7QM-4XPA"]);
    expect(r.out).toContain("Ducter 9.9.9 is already installed.");
    expect(r.called).toBe("worker|https://hel.example.com|--code|K7QM-4XPA|--service|");
    expect(r.status).toBe(0);
  });

  test("--name rides along", () => {
    expect(run(["worker", "http://192.168.1.20:7777", "--code=K7QM-4XPA", "--name", "nas"]).called).toBe("worker|http://192.168.1.20:7777|--code|K7QM-4XPA|--name|nas|--service|");
  });

  test("can't reach the home: one sentence, the outbound need, the check; nothing installed or joined", () => {
    const r = run(["worker", "https://hel.example.com", "--code", "K7QM-4XPA"], { reach: false });
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("can't reach https://hel.example.com. It only needs to reach that address (outbound; nothing comes in). Check: curl -sS -m 10 https://hel.example.com/health");
    expect(r.called).toBe("");
  });

  // Found live (research/127): the lend line printed the bundle's "Next: ducter service install …
  // then ducter tailscale or ducter domain" on a computer that is about to become a worker.
  test("a fresh install passes worker to the bundle, whose install.sh then leaves out a home's next steps", () => {
    expect(installer).toContain('DUCTER_INSTALL_FOR="${INSTALL_FOR:-}" sh "$TMP/$name/install.sh"');
    expect(installer).toContain("INSTALL_FOR=worker install_linux");
    const bundle = (env: Record<string, string>) => {
      const d = mkdtempSync(join(tmpdir(), "ducter-bundle-sh-"));
      try {
        mkdirSync(join(d, "from"), { recursive: true });
        writeFileSync(join(d, "from/ducter"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
        // The prefix's bin is on PATH: nothing is linked or written to a profile outside the folder.
        const r = spawnSync("sh", [join(import.meta.dir, "install.sh"), "--from", join(d, "from"), "--prefix", join(d, "p")], {
          // A Linux CI runner has a passwordless sudo and apt: Poppler is held off here (its own test below).
          env: { HOME: d, PATH: `${join(d, "p/bin")}:/usr/bin:/bin`, DUCTER_LOCALE: "en", DUCTER_NO_POPPLER: "1", ...env },
          encoding: "utf8",
        });
        expect(r.status).toBe(0);
        return r.stdout;
      } finally {
        rmSync(d, { recursive: true, force: true });
      }
    };
    const home = bundle({});
    expect(home).toContain("Ducter is installed");
    expect(home).toContain("Next:"); // `ducter up` on a Mac, `ducter service install` on Linux
    const worker = bundle({ DUCTER_INSTALL_FOR: "worker" });
    expect(worker).toContain("Ducter is installed");
    expect(worker).not.toContain("Next:");
    expect(worker).not.toContain("service install");
    expect(worker).not.toContain("tailscale");
  });

  test("no code: says how", () => {
    const r = run(["worker", "https://hel.example.com"]);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("worker <address> --code <code>");
  });
});

// D506: hel had no Poppler, so the document check missed most of a PDF's layout mistakes. The
// bundle's install.sh adds it on Linux when that needs no password, else says the one line.
describe("Poppler on a Linux home", () => {
  // A runner image that already has Poppler in /usr/bin can't show its absence.
  const sysPoppler = ["/usr/bin/pdftotext", "/bin/pdftotext"].some((p) => existsSync(p));
  /** A fake Linux: uname says Linux; apt-get, sudo and id as given; every apt-get call written to calls.log. */
  const linux = (o: { root?: boolean; sudo?: "nopass" | "asks"; aptWorks?: "yes" | "after-update" | "no"; has?: boolean }) => {
    const d = mkdtempSync(join(tmpdir(), "ducter-poppler-sh-"));
    try {
      const fake = join(d, "fake");
      mkdirSync(join(d, "from"), { recursive: true });
      mkdirSync(fake, { recursive: true });
      writeFileSync(join(d, "from/ducter"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const log = join(d, "calls.log");
      const sh = (name: string, body: string) => writeFileSync(join(fake, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      sh("uname", 'case "${1:-}" in -m) echo x86_64 ;; *) echo Linux ;; esac');
      sh("id", `echo ${o.root ? 0 : 1000}`);
      // Always a fake sudo: the real one (passwordless on a CI runner) would run the real apt-get.
      sh("sudo", `[ "$1" = -n ] && shift; ${o.sudo !== "nopass" ? 'echo "sudo: a password is required" >&2; exit 1' : '"$@"'}`);
      const made = `printf '#!/bin/sh\\n' > ${fake}/pdftotext; printf '#!/bin/sh\\n' > ${fake}/pdftoppm; chmod +x ${fake}/pdftotext ${fake}/pdftoppm`;
      const install = o.aptWorks === "no" ? "exit 100" : o.aptWorks === "after-update" ? `[ -f ${d}/updated ] || exit 100; ${made}` : made;
      sh("apt-get", `echo "apt-get $*" >> ${log}; case "$1" in update) touch ${d}/updated ;; install) ${install} ;; esac`);
      if (o.has) sh("pdftotext", ""), sh("pdftoppm", "");
      const r = spawnSync("sh", [join(import.meta.dir, "install.sh"), "--from", join(d, "from"), "--prefix", join(d, "p")], {
        // D549: as root these model the Poppler step alone (the handover to an ordinary user is tested below).
        env: { HOME: d, PATH: `${fake}:${join(d, "p/bin")}:/usr/bin:/bin`, DUCTER_LOCALE: "en", DUCTER_INSTALL_FOR: "worker", ...(o.root ? { DUCTER_AS_ROOT: "1" } : {}) },
        encoding: "utf8",
      });
      let calls = "";
      try {
        calls = readFileSync(log, "utf8");
      } catch {}
      return { status: r.status, out: r.stdout + r.stderr, calls };
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  test.skipIf(sysPoppler)("a passwordless sudo installs poppler-utils, with no prompt", () => {
    const r = linux({ sudo: "nopass", aptWorks: "yes" });
    expect(r.status).toBe(0);
    expect(r.calls).toContain("apt-get install -y -q poppler-utils");
    expect(r.out).toContain("Poppler (PDF pages are checked)");
    expect(r.out).not.toContain("sudo apt install");
  });

  test.skipIf(sysPoppler)("a fresh image's empty package lists: one update, then the install", () => {
    const r = linux({ root: true, aptWorks: "after-update" });
    expect(r.calls.split("\n").filter(Boolean)).toEqual(["apt-get install -y -q poppler-utils", "apt-get update -q", "apt-get install -y -q poppler-utils"]);
    expect(r.out).toContain("Poppler (PDF pages are checked)");
  });

  test.skipIf(sysPoppler)("a sudo that would ask a password: nothing run, the one line said; a failed install the same", () => {
    for (const r of [linux({ sudo: "asks", aptWorks: "yes" }), linux({ root: true, aptWorks: "no" })]) {
      expect(r.status).toBe(0);
      expect(r.out).toContain("most layout mistakes in a PDF go unseen");
      expect(r.out).toContain("sudo apt install poppler-utils");
    }
    expect(linux({ sudo: "asks", aptWorks: "yes" }).calls).toBe("");
  });

  test("Poppler already there: nothing said, nothing run", () => {
    const r = linux({ sudo: "nopass", aptWorks: "yes", has: true });
    expect(r.calls).toBe("");
    expect(r.out).not.toContain("Poppler");
  });
});

// D549 (hel, 2026-11-24: Ducter as root; Claude Code refused every task). Run as root, the bundle's
// install.sh installs for an ordinary user and runs the rest as that user, with linger on. A fake
// Linux records what root did; the real run as root (useradd, linger, the user unit, a working
// home and a worker) was a throwaway Debian 12 VM (research/225).
describe("as root on Linux: an ordinary user", () => {
  const asRoot = (o: { users?: string[]; env?: Record<string, string>; args?: string[] } = {}) => {
    const d = mkdtempSync(join(tmpdir(), "ducter-root-sh-"));
    try {
      const fake = join(d, "fake");
      mkdirSync(join(d, "from"), { recursive: true });
      mkdirSync(fake, { recursive: true });
      writeFileSync(join(d, "from/ducter"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const log = join(d, "calls.log");
      const users = join(d, "users");
      writeFileSync(users, (o.users ?? []).join("\n") + "\n");
      const sh = (name: string, body: string) => writeFileSync(join(fake, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      const rec = (name: string) => `echo "${name} $*" >> ${log}`;
      sh("uname", 'case "${1:-}" in -m) echo x86_64 ;; *) echo Linux ;; esac');
      // id: root for this shell (0) unless the run is already the user's; a user's id when named.
      sh("id", `if [ "\${1:-}" = -gn ]; then echo "$2"; elif [ -n "\${2:-}" ]; then grep -qx "$2" ${users} && echo 1001 || exit 1; elif [ -n "\${DUCTER_INSTALL_USER:-}" ]; then echo 1001; else echo 0; fi`);
      sh("useradd", `${rec("useradd")}; for a; do last="$a"; done; echo "$last" >> ${users}`);
      sh("getent", `grep -qx "$2" ${users} && echo "$2:x:1001:1001::${d}/home/$2:/bin/bash"`);
      sh("loginctl", rec("loginctl"));
      sh("systemctl", rec("systemctl"));
      sh("chown", rec("chown"));
      // runuser -u U -- env -i K=V... cmd: recorded, then run (as this same test user) with that env.
      sh("runuser", `${rec("runuser")}; shift 3; exec "$@"`);
      sh("apt-get", "exit 0");
      mkdirSync(join(d, "home"), { recursive: true });
      for (const u of o.users ?? []) mkdirSync(join(d, "home", u), { recursive: true });
      const r = spawnSync("sh", [join(import.meta.dir, "install.sh"), "--from", join(d, "from"), ...(o.args ?? [])], {
        env: { HOME: join(d, "roothome"), PATH: `${fake}:/usr/bin:/bin`, DUCTER_LOCALE: "en", DUCTER_NO_POPPLER: "1", ...(o.env ?? {}) },
        encoding: "utf8",
      });
      let calls = "";
      try {
        calls = readFileSync(log, "utf8");
      } catch {}
      return { status: r.status, out: r.stdout + r.stderr, calls, installed: existsSync(join(d, "home", (o.env?.DUCTER_USER ?? o.env?.SUDO_USER ?? "ducter"), ".local/bin/ducter")), rootInstalled: existsSync(join(d, "roothome/.local/bin/ducter")) };
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  };

  test("a fresh server logged into as root: makes `ducter`, turns linger on, installs and runs as it", () => {
    const r = asRoot();
    expect(r.status).toBe(0);
    expect(r.calls).toContain("useradd --create-home --shell /bin/bash ducter");
    expect(r.calls).toContain("loginctl enable-linger ducter");
    expect(r.calls).toMatch(/runuser -u ducter -- env -i HOME=\S+\/home\/ducter USER=ducter/);
    expect(r.installed).toBe(true);
    expect(r.rootInstalled).toBe(false);
    expect(r.out).toContain("Ducter is installed for the ordinary user ducter, and runs as ducter");
    expect(r.out).toContain("sudo -iu ducter");
  }, 60_000);

  test("with sudo: the person who came with it; DUCTER_USER names another; no user is made when there is one", () => {
    const viaSudo = asRoot({ users: ["wey"], env: { SUDO_USER: "wey" } });
    expect(viaSudo.status).toBe(0);
    expect(viaSudo.calls).not.toContain("useradd");
    expect(viaSudo.calls).toContain("runuser -u wey --");
    expect(viaSudo.out).toContain("using the user wey");
    const named = asRoot({ env: { DUCTER_USER: "w", SUDO_USER: "wey" } });
    expect(named.calls).toContain("useradd --create-home --shell /bin/bash w");
    expect(named.calls).toContain("runuser -u w --");
  }, 60_000);

  test("--service goes with it; --as-root (or DUCTER_AS_ROOT=1) keeps everything as root", () => {
    expect(asRoot({ args: ["--service"] }).calls).toMatch(/runuser -u ducter -- .*install\.sh --service/);
    for (const r of [asRoot({ args: ["--as-root"] }), asRoot({ env: { DUCTER_AS_ROOT: "1" } })]) {
      expect(r.status).toBe(0);
      expect(r.calls).not.toContain("runuser");
      expect(r.calls).not.toContain("useradd");
      expect(r.rootInstalled).toBe(true);
    }
  }, 60_000);
});
