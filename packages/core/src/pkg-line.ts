// D506: the one line to copy for a system package, in this computer's own package manager (D445's
// rule for pipx, `pipxCmd` in bridge-link.ts). Poppler is what the document check (D439) reads a
// PDF's pages with; on Linux it comes only from the system's packages.

/** Poppler's package by manager (Debian/Ubuntu and Fedora split it as poppler-utils; openSUSE as poppler-tools). */
const POPPLER: Record<string, string> = {
  "apt-get": "sudo apt install poppler-utils",
  dnf: "sudo dnf install poppler-utils",
  pacman: "sudo pacman -S poppler",
  zypper: "sudo zypper install poppler-tools",
};

export const popplerCmd = (platform: string = process.platform, has: (tool: string) => boolean = () => false): string => {
  if (platform === "darwin") return "brew install poppler";
  for (const m of ["apt-get", "dnf", "pacman", "zypper"]) if (has(m)) return POPPLER[m]!;
  return POPPLER["apt-get"]!;
};

/** The two Poppler tools the document check needs: the words' boxes and the pages as pictures. */
export const POPPLER_TOOLS = ["pdftotext", "pdftoppm"] as const;
