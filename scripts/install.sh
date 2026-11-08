#!/bin/sh
# Installs Ducter on this Mac: the `ducter` binary, plus the desktop app when Go is present.
#
#   scripts/install.sh                      # build from this checkout, install to ~/.local/bin
#   scripts/install.sh --prefix /opt/ducter # install to /opt/ducter/bin
#   scripts/install.sh --from DIR           # install prebuilt binaries from DIR (no build tools needed)
#   scripts/install.sh --bundle DIR         # build a folder you can hand to a friend:
#                                           #   DIR/ducter, DIR/ducter-desktop, DIR/install.sh, DIR/README.txt
#
# What it touches: only $PREFIX/bin/ducter and $PREFIX/bin/ducter-desktop.
# It never edits your shell profile; if $PREFIX/bin isn't on PATH it prints the line to add.
# Messages follow your locale (LANG); DUCTER_LOCALE=zh or en chooses.
set -eu

PREFIX="${DUCTER_PREFIX:-$HOME/.local}"
FROM=""
BUNDLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --from) FROM="$2"; shift 2 ;;
    --from=*) FROM="${1#*=}"; shift ;;
    --bundle) BUNDLE="$2"; shift 2 ;;
    --bundle=*) BUNDLE="${1#*=}"; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
done

# Same order as the ducter CLI: DUCTER_LOCALE, then LC_ALL > LC_MESSAGES > LANG.
LOC=en
for v in "${DUCTER_LOCALE:-}" "${LC_ALL:-}" "${LC_MESSAGES:-}" "${LANG:-}"; do
  case "$v" in
    "") continue ;;
    zh*|ZH*) LOC=zh; break ;;
    C|POSIX) continue ;;
    *) LOC=en; break ;;
  esac
done
# m "中文" "English": prints the one that matches the locale.
m() { if [ "$LOC" = zh ]; then printf '%s\n' "$1"; else printf '%s\n' "$2"; fi; }
step() { printf '\n'; m "$1" "$2"; }
ok() { printf '  \033[32m✓\033[0m '; m "$1" "$2"; }
[ -t 1 ] || ok() { printf '  ✓ '; m "$1" "$2"; }
tilde() { case "$1" in "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;; *) printf '%s' "$1" ;; esac; }

HERE="$(cd "$(dirname "$0")" && pwd)"
# When this script sits inside a bundle (next to the binaries), install from there.
if [ -z "$FROM" ] && [ -z "$BUNDLE" ] && [ -x "$HERE/ducter" ]; then FROM="$HERE"; fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/ducter-install.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

DUCTER_SRC=""
DESKTOP_SRC=""

if [ -n "$FROM" ]; then
  [ -x "$FROM/ducter" ] || { m "$FROM 里没有 ducter。" "No ducter binary in $FROM."; exit 1; }
  DUCTER_SRC="$FROM/ducter"
  [ -x "$FROM/ducter-desktop" ] && DESKTOP_SRC="$FROM/ducter-desktop"
else
  ROOT="$(cd "$HERE/.." && pwd)"
  [ -f "$ROOT/packages/cli/build.sh" ] || { m "请在 Ducter 仓库里运行，或者用 --from DIR。" "Run this from a Ducter checkout, or pass --from DIR."; exit 1; }

  step "正在构建 ducter…" "Building ducter…"
  if ! command -v bun >/dev/null 2>&1; then
    m "构建需要 Bun。安装：" "Bun is needed to build Ducter. Install it with:"
    printf '  curl -fsSL https://bun.sh/install | bash\n'
    exit 1
  fi
  (cd "$ROOT" && bun install --frozen-lockfile >/dev/null 2>&1 || bun install >/dev/null)
  sh "$ROOT/packages/cli/build.sh" "$WORK/ducter" >"$WORK/build.log" 2>&1 || { cat "$WORK/build.log"; exit 1; }
  DUCTER_SRC="$WORK/ducter"
  ok "ducter" "ducter"

  if command -v go >/dev/null 2>&1; then
    (cd "$ROOT/apps/desktop" && go build -o "$WORK/ducter-desktop" .)
    DESKTOP_SRC="$WORK/ducter-desktop"
    ok "桌面端" "the desktop app"
  else
    m "  · 没装 Go，先不构建桌面端。Ducter 照样能用；以后要桌面端：brew install go && scripts/install.sh" \
      "  · Go isn't installed, so no desktop app this time. Ducter still runs; to add it later: brew install go && scripts/install.sh"
  fi
fi

if [ -n "$BUNDLE" ]; then
  mkdir -p "$BUNDLE"
  cp "$DUCTER_SRC" "$BUNDLE/ducter"
  [ -n "$DESKTOP_SRC" ] && cp "$DESKTOP_SRC" "$BUNDLE/ducter-desktop"
  cp "$0" "$BUNDLE/install.sh"
  chmod +x "$BUNDLE/install.sh"
  cat >"$BUNDLE/README.txt" <<'EOF'
Ducter: a personal AI you run on your own Mac.
Ducter：在你自己的 Mac 上运行的个人 AI。

1. Open Terminal in this folder (or drag install.sh into a Terminal window) and run:
   在终端里进入这个文件夹（或者把 install.sh 拖进终端窗口），运行：

     sh install.sh

2. Then start it / 然后启动：

     ducter up

The first start checks this Mac and tells you the one command to run for anything missing.
You need Claude Code or Codex signed in; Ducter uses the AI plan you already have.
第一次启动会检查这台 Mac，缺什么都会给出一行补上的命令。
需要先登录 Claude Code 或 Codex；Ducter 用的是你已有的 AI 订阅。
EOF
  step "打包好了：$(tilde "$BUNDLE")" "Bundle ready: $(tilde "$BUNDLE")"
  m "把整个文件夹发给朋友。在他的 Mac 上：sh install.sh（README.txt 里写了）" \
    "Hand over the whole folder. On their Mac: sh install.sh (README.txt says so too)"
  exit 0
fi

BIN="$PREFIX/bin"
mkdir -p "$BIN"
install -m 0755 "$DUCTER_SRC" "$BIN/ducter"
[ -n "$DESKTOP_SRC" ] && install -m 0755 "$DESKTOP_SRC" "$BIN/ducter-desktop"
# Copies that arrived by AirDrop or a browser carry a quarantine flag; clear it on our two files only.
if [ "$(uname)" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  for f in "$BIN/ducter" "$BIN/ducter-desktop"; do
    [ -e "$f" ] && xattr -d com.apple.quarantine "$f" 2>/dev/null || true
  done
fi
step "Ducter 装好了" "Ducter is installed"
if [ -n "$DESKTOP_SRC" ]; then
  ok "ducter 和桌面端 → $(tilde "$BIN")" "ducter and the desktop app → $(tilde "$BIN")"
else
  ok "ducter → $(tilde "$BIN")" "ducter → $(tilde "$BIN")"
fi

case ":$PATH:" in
  *":$BIN:"*) ON_PATH=1 ;;
  *) ON_PATH=0 ;;
esac

step "下一步：" "Next:"
if [ "$ON_PATH" = 1 ]; then
  printf '  ducter up\n'
else
  printf '  %s/ducter up\n' "$(tilde "$BIN")"
  printf '\n'
  m "想以后只打 ducter：（这个脚本不会改你的 shell 配置）" "To type just ducter from now on (this script doesn't touch your shell profile):"
  printf '  echo '\''export PATH="%s:$PATH"'\'' >> ~/.zshrc && exec zsh\n' "$BIN"
fi
printf '\n'
m "第一次启动会先检查这台 Mac；缺什么，会告诉你补上的那一行命令。" \
  "The first start checks this Mac, and gives you the one command for anything missing."
