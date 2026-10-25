#!/usr/bin/env python3
"""Reapply the MimirBot fork changes on top of upstream OpenMausBot.

Idempotent: run it after every upstream merge (see mimir/UPDATING.md). Every change the fork makes lives in this
script, mimir/config.json and mimir/assets, so a merge that touches branded lines is fixed by taking upstream's text
and running this script again.

What it does:
  1. deletes enterprise/ (Enterprise License; not redistributable)
  2. renames the product (display name + packaging identity), leaving URLs that point at upstream services alone
  3. points auto-update and the update check at this fork's releases
  4. regenerates the app icons from mimir/assets/icons/<config.icon>
  5. adds the fork notice to README.md, NOTICE and SECURITY.md

What it deliberately keeps: internal protocol identifiers (openmausbot:// scheme, x-openmausbot-* headers, OMB_* and
OPENMAUSBOT_* variables, i18n keys, .well-known paths), so the companion apps and upstream docs stay compatible and the
diff against upstream stays small.
"""
import base64
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CFG = json.loads((ROOT / "mimir" / "config.json").read_text())
NAME, SHORT, SLUG, FORK, UPSTREAM = CFG["name"], CFG["short"], CFG["slug"], CFG["fork"], CFG["upstream"]
FORK_OWNER = FORK.split("/")[0]

FORK_NOTE_MARK = "<!-- mimir-fork-notice -->"

EXCLUDE_PREFIXES = (
    ".git/", ".github/", ".claude/", ".oss-scanner/", ".tmpexp/", "third_party/", "mimir/", "_Icones_novos/",
    "docs/plans/", "docs/superpowers/", "electron/vendor/", "node_modules/",
)
EXCLUDE_FILES = {"LICENSE", "NOTICE", "CLA.md", "LICENSING.md", "pnpm-lock.yaml"}
SKIP_EXT = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".icns", ".svg", ".woff", ".woff2", ".ttf", ".otf", ".mp4",
    ".mov", ".pdf", ".zip", ".gz", ".wasm", ".bin", ".node", ".dylib", ".so", ".apk", ".ipa", ".par",
}
URLISH = re.compile(
    r"://|milind-soni|github\.com|ghcr\.io|githubusercontent|img\.shields|"
    r"openmausbot\.(com|test|invalid|local)|mausbot\.(com|page|si)|releases/download|\$\{[A-Z_]*REPO",
    re.I,
)
TOKEN_STOP = set(" \t\r\n\"'`<>()[]{},;|")


def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True, text=True, check=True).stdout


def tracked_text_files():
    for rel in git("ls-files", "-z").split("\0"):
        if not rel or rel in EXCLUDE_FILES or rel.startswith(EXCLUDE_PREFIXES):
            continue
        p = ROOT / rel
        if p.suffix.lower() in SKIP_EXT or not p.is_file() or p.is_symlink():
            continue
        yield rel, p


def token_at(text, start, end):
    a = start
    while a > 0 and text[a - 1] not in TOKEN_STOP:
        a -= 1
    b = end
    while b < len(text) and text[b] not in TOKEN_STOP:
        b += 1
    return text[a:b]


def sub_outside_urls(pattern, repl, text):
    def fn(m):
        return m.group(0) if URLISH.search(token_at(text, m.start(), m.end())) else repl(m) if callable(repl) else repl
    return pattern.sub(fn, text)


RULES = [
    (re.compile(r"(?<![Xx]-)OpenMausBot"), NAME),  # X-OpenMausBot-* are header/desktop-entry keys the server and old installs read
    (re.compile(r"OpenMaus(?![a-z])"), NAME[: -len("Bot")] if NAME.endswith("Bot") else NAME),
    (re.compile(r"\bMausBot\b"), SHORT),
    (re.compile(r"(?<![\w.])(?<!com\\)\.openmausbot(?![\w.])"), "." + SLUG),
]
GLOBAL_EXACT = [("com.openmausbot.app", f"com.{SLUG}.app")]
# The packaged executable / .deb name changes together with the two scripts that assert it. Everything else lowercase
# (openmausbot-browser, @openmausbot/*, server/openmausbot.ts, ...) stays as upstream.
PACKAGING_SCRIPTS = ("scripts/verify-linux-package.mjs", "scripts/run-linux-package-smoke.mjs")
EXEC_NAME = re.compile(r"(?<![\w.@-])openmausbot(?=[\s\"'%]|\.svg|$)")

FIXED = [
    # (file, old, new): auto-update and update check read this fork's releases, not upstream's
    ("electron-builder.yml", f"    owner: milind-soni\n    repo: {NAME}\n", f"    owner: {FORK_OWNER}\n    repo: {SLUG}\n"),
    ("package.json", '"name": "openmausbot",', f'"name": "{SLUG}",'),
    ("electron-builder.yml", "executableName: openmausbot", f"executableName: {SLUG}"),
    ("server/update-check.ts", f"repos/{UPSTREAM}/releases/latest", f"repos/{FORK}/releases/latest"),
    ("package.json", f"https://github.com/{UPSTREAM}", f"https://github.com/{FORK}"),
    ("scripts/verify-linux-package.mjs", "owner: milind-soni$", f"owner: {FORK_OWNER}$"),
    ("scripts/verify-linux-package.mjs", f"repo: {NAME}$", f"repo: {SLUG}$"),
    ("scripts/verify-linux-package.mjs", f"does not point at {UPSTREAM}", f"does not point at {FORK}"),
    ("src/lib/app-links.ts", "android-v1.5.0/MimirBot.apk", "android-v1.5.0/OpenMausBot.apk"),
    ("src/lib/app-links.ts", 'export const FEEDBACK_URL = "https://discord.gg/9Wb8MEpXRs";', f'export const FEEDBACK_URL = "https://github.com/{FORK}/issues";'),
    # prompt-injection guards: the app's own notes now open with "[MimirBot ...", so a bot's forged copy must be caught too
    ("server/peer-provenance.ts", 'const HEADER_WORDS = new Set(["openmausbot", "omb"]);',
     f'const HEADER_WORDS = new Set(["openmausbot", "omb", "{NAME.lower()}"]);'),
    ("server/records-block.ts", r"default\b|openmausbot\b))", rf"default\b|openmausbot\b|{NAME.lower()}\b))"),
    # a test that matches the team host as an escaped regex, which the services step's plain-host rule cannot see
    ("electron/home-window.node-test.mjs", r"omb-u-acme\.fly\.dev", rf"omb-u-acme\.{SLUG}\.invalid"),
    # X-OpenMausBot-* names are protocol: the server matches the desktop owner header by that exact name
    ("electron/desktop-server-auth.cjs", "X-MimirBot-", "X-OpenMausBot-"),
    ("electron/server-session.node-test.mjs", "X-MimirBot-", "X-OpenMausBot-"),
    ("electron/open-at-login.mjs", "X-MimirBot-", "X-OpenMausBot-"),
    # the container label is a reverse-DNS id kept from upstream, not the data folder
    ("server/vps-computer.test.ts", rf"com\.{SLUG}\.environment=", r"com\.openmausbot\.environment="),
    # these load enterprise/server/*, which the fork does not ship
    ("server/hosted-access.test.ts", 'describe("hosted bridge in the full server", () => {',
     'describe.skip("hosted bridge in the full server", () => {'),
    ("server/hosted-models-api.test.ts", '  it("advertises only assignments and reconciles saved choices',
     '  it.skip("advertises only assignments and reconciles saved choices'),
    # the persona preview counts bytes, and the product name is in it
    ("server/index.test.ts", f'personal bot in {NAME}. Role: Tracker. About: Files bugs.",\n        bytes: 78,',
     f'personal bot in {NAME}. Role: Tracker. About: Files bugs.",\n        bytes: '
     f'{len(f"You are Kiwi, a personal bot in {NAME}. Role: Tracker. About: Files bugs.".encode())},'),
    ("src/components/SidebarProfileMenu.test.ts",
     'it("sends Send Feedback to the Discord community", () => {\n    expect(FEEDBACK_URL).toBe("https://discord.gg/9Wb8MEpXRs");',
     f'it("sends Send Feedback to the fork\'s issues", () => {{\n    expect(FEEDBACK_URL).toBe("https://github.com/{FORK}/issues");'),
    ("src/lib/skins.ts", "Fresh white with a calm green.", "Fresh white with a calm blue."),
    ("SECURITY.md", "- **Email** **soni.mil2001@gmail.com** with the details.",
     "- Use GitHub's private vulnerability reporting for this fork (link below)."),
    ("SECURITY.md", f"<https://github.com/{UPSTREAM}/security/advisories/new>", f"<https://github.com/{FORK}/security/advisories/new>"),
]


def step_enterprise():
    d = ROOT / "enterprise"
    if d.exists():
        subprocess.run(["git", "-C", str(ROOT), "rm", "-rq", "--ignore-unmatch", "enterprise"], check=False)
        shutil.rmtree(d, ignore_errors=True)
        print("removed enterprise/")


OLD_EN = {}


def step_rename():
    global OLD_EN
    en = ROOT / "src" / "locales" / "en.json"
    if en.exists():
        OLD_EN = json.loads(en.read_text(encoding="utf-8"))
    changed = 0
    for rel, p in tracked_text_files():
        try:
            raw = p.read_bytes()
            if b"\0" in raw[:8192]:
                continue
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        head, body = "", text
        if FORK_NOTE_MARK in text:  # the fork banner names upstream on purpose
            cut = text.index("\n\n", text.index(FORK_NOTE_MARK)) + 2
            head, body = text[:cut], text[cut:]
        new = body
        for pat, repl in RULES:
            new = sub_outside_urls(pat, repl, new)
        for old, rep in GLOBAL_EXACT:
            new = new.replace(old, rep)
        if rel in PACKAGING_SCRIPTS:
            new = sub_outside_urls(EXEC_NAME, SLUG, new)
        new, text = head + new, head + body
        if new != text:
            p.write_text(new, encoding="utf-8")
            changed += 1
    print(f"renamed brand in {changed} files")


def step_locale_hashes():
    """Translations are tracked by a hash of their English source (pnpm i18n:check, run by the pre-push hook).
    The rename edits the English text and every translation together, so move the recorded hashes along."""
    import hashlib  # noqa: PLC0415

    en_path = ROOT / "src" / "locales" / "en.json"
    hashes_path = ROOT / "src" / "locales" / "source-hashes.json"
    if not OLD_EN or not en_path.exists() or not hashes_path.exists():
        return
    sha = lambda s: hashlib.sha256(str(s).encode("utf-8")).hexdigest()  # noqa: E731
    new_en = json.loads(en_path.read_text(encoding="utf-8"))
    moved = {k: (sha(OLD_EN[k]), sha(v)) for k, v in new_en.items() if k in OLD_EN and OLD_EN[k] != v}
    data = json.loads(hashes_path.read_text(encoding="utf-8"))
    n = 0
    for per_locale in data.get("locales", {}).values():
        for key, old_new in moved.items():
            if per_locale.get(key) == old_new[0]:
                per_locale[key] = old_new[1]
                n += 1
    if n:
        hashes_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"translation source hashes moved: {n}")


def step_fixed():
    n = 0
    for rel, old, new in FIXED:
        p = ROOT / rel
        if not p.exists():
            continue
        t = p.read_text(encoding="utf-8")
        if old in t:
            p.write_text(t.replace(old, new), encoding="utf-8")
            n += 1
    print(f"fixed edits applied: {n}")


def step_notices():
    readme = ROOT / "README.md"
    t = readme.read_text(encoding="utf-8")
    if FORK_NOTE_MARK not in t:
        banner = (
            f"{FORK_NOTE_MARK}\n"
            f"> **{NAME}** is a fork of [OpenMausBot](https://github.com/{UPSTREAM}) (Apache-2.0), rebranded and without the\n"
            f"> `enterprise/` directory. Upstream fixes are merged regularly, see [mimir/UPDATING.md](mimir/UPDATING.md).\n"
            f"> Download links and badges below may still point at upstream releases; builds of this fork are published at\n"
            f"> [{FORK}/releases](https://github.com/{FORK}/releases).\n\n"
        )
        readme.write_text(banner + t, encoding="utf-8")
    notice = ROOT / "NOTICE"
    n = notice.read_text(encoding="utf-8")
    if f"{NAME} is a fork" not in n:
        n = n.rstrip("\n") + (
            f"\n\n{NAME} is a fork of OpenMausBot (https://github.com/{UPSTREAM}), Copyright 2026 Milind Soni and\n"
            f"OpenMausBot contributors, used under the Apache License, Version 2.0. Changes in this fork: the product name and\n"
            f"icons, the update source, the removal of the enterprise/ directory (not covered by Apache-2.0), and the\n"
            f"scripts in mimir/. The original copyright and license notices above are kept unchanged.\n"
        )
        notice.write_text(n, encoding="utf-8")
    print("fork notices ok")


def step_icons():
    from PIL import Image  # noqa: PLC0415
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    src = (ROOT / "mimir" / "assets" / "icons" / CFG["icon"]).read_text(encoding="utf-8")
    inner = re.sub(r"^\s*<svg[^>]*>", "", src, count=1, flags=re.S)
    inner = re.sub(r"</svg>\s*$", "", inner)
    top, bottom = CFG["icon_tile"]
    comp = (
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">'
        f'<defs><radialGradient id="tile" cx="30%" cy="18%" r="95%"><stop stop-color="{top}"/><stop offset="1" stop-color="{bottom}"/></radialGradient></defs>'
        '<rect width="1024" height="1024" rx="228" fill="url(#tile)"/>'
        f'<svg x="128" y="112" width="768" height="768" viewBox="0 0 512 512">{inner}</svg></svg>'
    )
    (ROOT / "build" / "icon.svg").write_text(comp, encoding="utf-8")
    (ROOT / "public" / "app-icon.svg").write_text(comp, encoding="utf-8")

    tmp = ROOT / "mimir" / ".icon-1024.png"
    html = f'<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,{base64.b64encode(comp.encode()).decode()}" width="1024" height="1024" style="display:block"></body></html>'
    page_file = ROOT / "mimir" / ".icon.html"
    page_file.write_text(html, encoding="utf-8")
    chrome = shutil.which("google-chrome") or shutil.which("chromium")
    with sync_playwright() as pw:
        kw = {"executable_path": chrome, "args": ["--no-sandbox"]} if chrome else {}
        b = pw.chromium.launch(**kw)
        pg = b.new_page(viewport={"width": 1024, "height": 1024})
        pg.goto(page_file.as_uri())
        pg.screenshot(path=str(tmp), omit_background=True)
        b.close()
    big = Image.open(tmp).convert("RGBA")
    page_file.unlink()
    tmp.unlink()

    def png(rel, size):
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        big.resize((size, size), Image.LANCZOS).save(out)

    png("build/icon-1024.png", 1024)
    png("electron/resources/app-icon.png", 1024)
    for rel, s in (("public/app-icon-192.png", 192), ("public/app-icon-512.png", 512), ("public/apple-touch-icon.png", 180)):
        png(rel, s)
    for f in sorted((ROOT / "build" / "icon.iconset").glob("*.png")):
        png(f"build/icon.iconset/{f.name}", Image.open(f).size[0])
    big.save(ROOT / "build" / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    big.save(ROOT / "build" / "icon.icns")
    print(f"icons regenerated from {CFG['icon']}")


def step_mascot():
    """The welcome screen shows brand().logo when it is set (the white-label hook), so the default brand carries the
    new mascot instead of the upstream one."""
    svg = (ROOT / "mimir" / "assets" / "icons" / CFG["mascot"]).read_text(encoding="utf-8")
    # the artwork has a wide margin; crop to the pebble and its shadow so it fills the 72px slot
    svg = svg.replace('viewBox="0 0 512 512"', f'viewBox="{CFG.get("mascot_crop", "80 88 352 360")}"', 1)
    uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode()
    line = re.compile(r"export const DEFAULT_BRAND: Brand = \{[^}\n]*\};")
    for rel in ("server/brand.ts", "src/lib/brand.ts"):
        p = ROOT / rel
        t = p.read_text(encoding="utf-8")
        new = line.sub(lambda _m: f'export const DEFAULT_BRAND: Brand = {{ name: "{NAME}", logo: "{uri}" }};', t, count=1)
        if new != t:
            p.write_text(new, encoding="utf-8")
    print(f"welcome mascot set from {CFG['mascot']}")


# Hosted services run by the original author. Every host moves to the reserved .invalid TLD (RFC 2606), which never
# resolves: the app treats it as an unreachable Cloud and keeps working locally, and nothing is sent to the author.
SERVICE_RULES = [
    (re.compile(r"omb-[a-z0-9-]+\.fly\.dev"), lambda m: m.group(0)[: -len(".fly.dev")] + f".{SLUG}.invalid"),
    (re.compile(r"https://openmausbot-composio\.[a-z0-9]+\.workers\.dev"), f"https://composio-broker.{SLUG}.invalid"),
    (re.compile(r"\bopenmausbot\.com\b"), f"{SLUG}.invalid"),
    (re.compile(r"\bmausbot\.(?:com|page|si)\b"), f"{SLUG}.invalid"),
]
SERVICE_EXCLUDE = ("docs/", "cloudflare/", "deploy/", "apps/")


def step_services():
    changed = 0
    for rel, p in tracked_text_files():
        if rel.startswith(SERVICE_EXCLUDE):
            continue
        try:
            raw = p.read_bytes()
            if b"\0" in raw[:8192]:
                continue
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        new = text
        for pat, repl in SERVICE_RULES:
            new = pat.sub(repl, new)
        if new != text:
            p.write_text(new, encoding="utf-8")
            changed += 1
    print(f"author's hosted services disabled in {changed} files")


def _p3(hex_):
    """sRGB hex to a CSS display-p3 color() string."""
    h = hex_.lstrip("#")
    def dec(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    lin = [dec(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)]
    x = [sum(m * v for m, v in zip(row, lin)) for row in (
        (0.4124564, 0.3575761, 0.1804375), (0.2126729, 0.7151522, 0.0721750), (0.0193339, 0.1191920, 0.9503041))]
    p = [sum(m * v for m, v in zip(row, x)) for row in (
        (2.4934969, -0.9313836, -0.4027108), (-0.8294890, 1.7626641, 0.0236247), (0.0358458, -0.0761724, 0.9568845))]
    enc = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * (max(c, 0) ** (1 / 2.4)) - 0.055  # noqa: E731
    return "color(display-p3 " + " ".join(f"{enc(c):.4f}" for c in p) + ")"


APPLE_BLUE = "#007aff"     # system blue: borders
APPLE_FILL = "#0071e3"     # filled buttons and the focus ring: white ink at 4.7:1
APPLE_LINK = "#0062cc"     # link text on the tinted grounds: 5.3:1 or better
APPLE_INK = "#0d1522"

# (property, old, new) for the Meadow skin's sRGB tokens; the green semantic tokens (success) stay green.
METADOW = [
    ("--color-panel", "#f6f8f6", "#f5f7fb"), ("--color-raised", "#e9eeea", "#e8eef7"),
    ("--color-raised-hover", "#d6efdf", "#d6e6fb"), ("--color-card", "#f1f5f2", "#f0f4fa"),
    ("--color-inset", "#e7ece8", "#e6ecf5"), ("--color-control", "#dce3de", "#d3dbe8"), ("--color-control", "#dbe3ef", "#d3dbe8"),
    ("--color-hairline", "#c9d3cc", "#c8d2e0"), ("--color-ink", "#0f1a13", APPLE_INK),
    ("--color-ink-secondary", "#4d5a52", "#4a5568"), ("--color-ink-tertiary", "#4f5c54", "#4c586b"),
    ("--color-accent", "#1a7a48", APPLE_FILL), ("--color-accent-border", "#1f8a52", APPLE_BLUE),
    ("--color-accent-text", "#176b3f", APPLE_LINK), ("--color-focus", "#1a7a48", APPLE_FILL), ("--color-focus", APPLE_BLUE, APPLE_FILL),
    ("--color-composer-ring", "#e3e9e4", "#e2e8f2"), ("--color-bubble-user", "#0f1a13", APPLE_INK),
    ("--color-scrollbar", "#c3cdc6", "#c3cddb"), ("--color-maus-line", "#5a675f", "#566376"),
    # the mobile ground
    ("--color-app", "#f6f8f6", "#f5f7fb"), ("--color-panel", "#fcfdfc", "#fbfcfe"),
    ("--color-inset", "#e9eeea", "#e8eef7"), ("--color-composer-ring", "#cfd8d1", "#d0d9e8"),
    ("--color-hairline", "#c1ccc4", "#c2cddd"),
]
# the user's own bubble, a dark surface inside the light skin
METADOW_BUBBLE = [
    ("--color-ink-secondary", "#c3d6ca", "#c6d4e8"), ("--color-ink-tertiary", "#a9bfb1", "#acbdd6"),
    ("--color-panel", "#142219", "#121c2e"), ("--color-inset", "#1b2b21", "#19263b"),
    ("--color-raised", "#2a3b30", "#28384f"), ("--color-raised-hover", "#35493c", "#33465f"),
    ("--color-control", "#2a3b30", "#28384f"), ("--color-hairline", "#5f7266", "#5f7088"),
    ("--color-accent", "#7fdca8", "#7ab8ff"), ("--color-accent-text", "#7fdca8", "#7ab8ff"),
    ("--color-accent-ink", "#0f1a13", APPLE_INK), ("--color-focus", "#7fdca8", "#7ab8ff"),
    ("--color-danger-ink", "#0f1a13", APPLE_INK),
]
# wide-gamut copies of the accent tokens (the sRGB ones above are overridden on P3 screens)
METADOW_P3 = {
    "--color-accent": _p3(APPLE_FILL), "--color-accent-border": _p3(APPLE_BLUE),
    "--color-accent-text": _p3(APPLE_LINK), "--color-focus": _p3(APPLE_FILL),
}


def _block_spans(text, marker):
    pos = 0
    while (i := text.find(marker, pos)) != -1:
        j = text.index("{", i + len(marker) - 1)
        depth, k = 0, j
        while True:
            depth += text[k] == "{"
            depth -= text[k] == "}"
            k += 1
            if depth == 0:
                break
        yield j, k
        pos = k


def _retoken(block, items):
    for prop, old, new in items:
        block = re.sub(rf"(?m)(^\s*{re.escape(prop)}:\s*){re.escape(old)}(?![0-9a-fA-F])", rf"\g<1>{new}", block)
    return block


def step_theme():
    """The default skin (Meadow) carries the upstream green brand look; this swaps it for Apple's interface blue."""
    p = ROOT / "src" / "styles.css"
    t = p.read_text(encoding="utf-8")
    original = t
    plan = [('[data-skin="meadow"] {', METADOW), ('@scope ([data-skin="meadow"]) to ([data-skin]) {', METADOW_BUBBLE),
            (':is([data-skin="meadow"]) {', METADOW)]
    for marker, items in plan:
        spans = list(_block_spans(t, marker))
        for j, k in reversed(spans):
            block = _retoken(t[j:k], items)
            if marker.startswith(":is("):
                for prop, val in METADOW_P3.items():
                    block = re.sub(rf"(?m)(^\s*{re.escape(prop)}:\s*)color\(display-p3 [^)]*\)", rf"\g<1>{val}", block)
            t = t[:j] + block + t[k:]
    if t != original:
        p.write_text(t, encoding="utf-8")
    print("default skin recolored to Apple blue")


SIDEBAR_FOOTER = ('/> : phone ? <SidebarPhoneBar query={query} onQuery={setQuery} /> : <SidebarFooter density={density} '
                  'toolsCollapsed={sectionCollapsed(TOOLS_SECTION_ID)} onToggleTools={layoutInteractive ? () => '
                  'toggleSection(TOOLS_SECTION_ID) : undefined} />}')
# (file, upstream text, fork text). The fork's icon rail (src/mimir/MimirRail.tsx) takes over the sidebar footer and
# tools rows, so they come out of Sidebar and of the collapsed sidebar's footer.
RAIL_PATCHES = [
    ("src/App.tsx", 'import { Sidebar } from "@/components/Sidebar";\n',
     'import { Sidebar } from "@/components/Sidebar";\nimport { MimirRail } from "@/mimir/MimirRail";\n'),
    ("src/App.tsx", "      {!calendarFocus && <Sidebar\n", "      <MimirRail />\n      {!calendarFocus && <Sidebar\n"),
    ("src/components/Sidebar.tsx", SIDEBAR_FOOTER, "/> : phone ? <SidebarPhoneBar query={query} onQuery={setQuery} /> : null}"),
    ("src/components/Sidebar.tsx", 'import { SidebarFooter } from "./SidebarFooter";\n', ""),
    ("src/components/Sidebar.tsx", "  TOOLS_SECTION_ID,\n", ""),
    ("src/components/SidebarSimpleRail.tsx",
     '      <SidebarFooterNav density="icons" rail />\n      <UpdateIndicator />\n      <div className="mt-1.5">\n'
     '        <SidebarProfileMenu iconOnly rail />\n      </div>\n', ""),
    ("src/components/SidebarSimpleRail.tsx", 'import { SidebarFooterNav } from "./SidebarFooterNav";\n'
     'import { SidebarProfileMenu } from "./SidebarProfileMenu";\n', ""),
    ("src/components/SidebarSimpleRail.tsx", 'import { UpdateIndicator } from "./UpdateIndicator";\n', ""),
    # Top bar (src/mimir/MimirTopBar.tsx): the sidebar's top row titles the workspace on the left, and the chat header
    # lines up beside it as one 44px bar: Back, Forward, New, the conversation, then the model and the panel toggle.
    ("src/components/Sidebar.tsx", 'import { DesktopWorkspaceSwitcher } from "./DesktopWorkspaceSwitcher";\n',
     'import { DesktopWorkspaceSwitcher } from "./DesktopWorkspaceSwitcher";\nimport { MimirWorkspaceButton } from "@/mimir/MimirTopBar";\n'),
    ("src/components/Sidebar.tsx", '"h-12 max-md:h-16"', '"h-11 border-b border-hairline/40 max-md:h-16"'),
    ("src/components/Sidebar.tsx",
     '<div data-sidebar-top-slot className={cn("@container/sidebar-top flex min-w-0 flex-1 items-center", simple && "justify-end")}>\n'
     '            {!simple && <div data-sidebar-top-spacer className="min-w-0 flex-1 @min-[96px]/sidebar-top:min-w-6" />}\n'
     '            <div data-sidebar-top-switcher className={simple ? "flex min-w-0 items-center" : "flex min-w-0 max-w-[140px] items-center"}>\n'
     '              <DesktopWorkspaceSwitcher inline pill={simple} cloudHome={state.config?.cloudHome === true} owner={cloudOwner} howTo={state.cloudHowTo} onMenuClosed={endHowTo} />',
     '<div data-sidebar-top-slot className="@container/sidebar-top flex min-w-0 flex-1 items-center">\n'
     '            <div data-sidebar-top-switcher className="flex min-w-0 items-center">\n'
     '              <MimirWorkspaceButton cloudHome={state.config?.cloudHome === true} owner={cloudOwner} howTo={state.cloudHowTo} onMenuClosed={endHowTo} />'),
    ("src/components/ChatView.tsx", 'import { ModelPicker } from "./ModelPicker";\n',
     'import { ModelPicker } from "./ModelPicker";\nimport { MimirChatNav, MimirPanelToggle } from "@/mimir/MimirTopBar";\n'),
    ("src/components/ChatView.tsx",
     'const CHATHEAD_PILL = "flex min-w-0 items-center gap-2 rounded-full border border-hairline/40 bg-control/60 py-0.5 pl-1.5 text-ink";',
     'const CHATHEAD_PILL = "flex min-w-0 items-center gap-2 rounded-lg py-0.5 pl-1 text-ink";'),
    ("src/components/ChatView.tsx", '"pl-11 md:pl-5 max-md:pl-14 max-md:pr-3",',
     '"pl-11 md:flex md:h-11 md:items-center md:border-b md:border-hairline/40 md:py-0 md:pl-3 md:pr-[13px] max-md:pl-14 max-md:pr-3",'),
    ("src/components/ChatView.tsx",
     'phone ? "gap-2" : "@max-[30rem]/chathead:flex-wrap @max-[30rem]/chathead:gap-y-1 @min-[30rem]/chathead:grid '
     '@min-[30rem]/chathead:grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(max-content,1fr)]")}>',
     'phone ? "gap-2" : "w-full gap-2")}>'),
    ("src/components/ChatView.tsx",
     '<div data-chathead-identity className={cn("flex min-w-0 items-center gap-2", phone ? "flex-1" : '
     '"@max-[30rem]/chathead:basis-full @min-[30rem]/chathead:col-start-2 @min-[30rem]/chathead:justify-self-center")} style={headerNoDragStyle}>',
     '{!phone && <MimirChatNav bot={bot} />}<div data-chathead-identity className="flex min-w-0 flex-1 items-center gap-2" style={headerNoDragStyle}>'),
    ("src/components/ChatView.tsx",
     '!phone && "@max-[30rem]/chathead:ml-auto @max-[30rem]/chathead:flex-wrap @max-[30rem]/chathead:justify-end '
     '@min-[30rem]/chathead:col-start-3 @min-[30rem]/chathead:justify-self-end")}',
     '!phone && "ml-auto")}'),
    ("src/components/ChatView.tsx",
     "          {/* Simple mode moves the model, the computer and ⋯ into the bot panel; a remote client's panel has neither. */}\n"
     "          {advanced && !remoteClient && !phone && <ModelPicker key={bot.threadId} bot={bot} threadId={bot.threadId} />}",
     "          {!remoteClient && !phone && <ModelPicker key={bot.threadId} bot={bot} threadId={bot.threadId} />}"),
    ("src/components/ChatView.tsx",
     "{phoneMenu ? <ChatMoreMenu bot={bot} phoneHeader /> : (advanced || remoteClient) && <ChatHeaderMenu key={`menu:${bot.threadId}`} bot={bot} />}\n        </div>",
     "{phoneMenu ? <ChatMoreMenu bot={bot} phoneHeader /> : (advanced || remoteClient) && <ChatHeaderMenu key={`menu:${bot.threadId}`} bot={bot} />}\n"
     "          {!phone && <MimirPanelToggle />}\n        </div>"),
    ("src/components/ModelPicker.tsx",
     '"flex items-center gap-1.5 rounded-full border border-hairline/40 bg-control/60 py-1 pl-2 pr-2.5 text-[13px] text-ink '
     'hover:bg-raised-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-control/60",',
     '"flex h-[35px] items-center gap-2 rounded-lg pl-[3px] pr-2.5 text-[14px] text-ink hover:bg-raised '
     'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",'),
    # The AI usage warnings live in the rail's Notifications instead of the chat header and the top of Automations.
    ("src/components/ChatView.tsx", "          <EngineLimitNotice engine={bot.modelSelection?.instanceId} />\n", ""),
    ("src/components/ChatView.tsx", 'import { EngineLimitNotice, useLimitResetContinue } from "./LimitResetContinue";',
     'import { useLimitResetContinue } from "./LimitResetContinue";'),
    ("src/components/TriggersPage.tsx", '              <LimitWarnings botFilter={showFilter ? botFilter : "all"} />\n', ""),
    ("src/components/TriggersPage.tsx", 'import { LimitWarnings } from "./automations/LimitWarnings";\n', ""),
    # A usage endpoint that refuses a poll (Claude's answers 429 when several screens ask at once) would drop the engine
    # from the rings and the warnings; keep its last good reading for a while instead. Sign-in problems still show.
    ("server/plan-usage.ts", "  cachedReport = { at: now, key, report };\n  return report;\n}\n",
     "  report.providers = report.providers.map((row) => keepLastGood(row, now));\n"
     "  cachedReport = { at: now, key, report };\n  return report;\n}\n\n"
     "const LAST_GOOD_MS = 30 * 60_000;\n"
     "const lastGood = new Map<string, { at: number; row: PlanProviderRow }>();\n\n"
     "function keepLastGood(row: PlanProviderRow, now: number): PlanProviderRow {\n"
     "  if (row.ok) {\n    lastGood.set(row.id, { at: now, row });\n    return row;\n  }\n"
     "  const kept = lastGood.get(row.id);\n"
     "  const driver = row.driver as PlanDriver;\n"
     "  const transient = row.error === couldNotReach(driver) || row.error === unexpectedUsage(driver);\n"
     "  return kept && transient && now - kept.at <= LAST_GOOD_MS ? kept.row : row;\n}\n"),
    ("server/plan-usage.ts", "export function clearPlanUsageCache(): void {\n  cachedReport = null;\n}",
     "export function clearPlanUsageCache(): void {\n  cachedReport = null;\n  lastGood.clear();\n}"),
    # Upstream's tests of the footer, top row and chat header these replace; src/mimir/*.test.ts cover the new layout.
    ("src/components/Sidebar.header.test.ts", '  it("collapses Simple mode to a rail: only the lights on top,',
     '  it.skip("collapses Simple mode to a rail: only the lights on top,'),
    ("src/components/Sidebar.header.test.ts", '  it("puts the lights, a drag space, then the compact server switcher',
     '  it.skip("puts the lights, a drag space, then the compact server switcher'),
    ("src/components/Sidebar.header.test.ts", '  it("in Simple mode keeps the server pill, a round search and a round +',
     '  it.skip("in Simple mode keeps the server pill, a round search and a round +'),
    ("src/components/Sidebar.header.test.ts",
     '  it.each([["win-caption", "Windows"], ["native", "Linux"]] as const)(\n    "keeps the same right-aligned order',
     '  it.skip.each([["win-caption", "Windows"], ["native", "Linux"]] as const)(\n    "keeps the same right-aligned order'),
    ("src/components/Sidebar.header.test.ts", '  it("keeps the browser build\'s placeholder lights 12px clear',
     '  it.skip("keeps the browser build\'s placeholder lights 12px clear'),
    ("src/components/ChatView.controls.test.ts", '  it("shows only what applies in Simple mode: no model, computer or ⋯',
     '  it.skip("shows only what applies in Simple mode: no model, computer or ⋯'),
    ("src/components/ChatView.controls.test.ts", '  it("keeps Stop in the Simple header while a turn runs",',
     '  it.skip("keeps Stop in the Simple header while a turn runs",'),
    ("src/components/ChatView.controls.test.ts", '  it("renames only from the bot\'s settings in Simple mode: no pencil',
     '  it.skip("renames only from the bot\'s settings in Simple mode: no pencil'),
    ("src/components/ChatView.controls.test.ts", '  it("centres the bot in the header\'s middle column',
     '  it.skip("centres the bot in the header\'s middle column'),
    ("src/components/ChatView.controls.test.ts", '  it("wraps the header into a name line and a chip line',
     '  it.skip("wraps the header into a name line and a chip line'),
    ("src/components/Sidebar.header.test.ts", 'describe("sidebar glass head and foot", () => {',
     'describe.skip("sidebar glass head and foot", () => {'),
    ("src/components/Sidebar.header.test.ts", 'describe("sidebar foot in Simple mode", () => {',
     'describe.skip("sidebar foot in Simple mode", () => {'),
]


def step_rail():
    """Mounts the fork's icon rail. An upstream change to one of these lines stops the script instead of dropping the rail."""
    missing = []
    for rel, old, new in RAIL_PATCHES:
        p = ROOT / rel
        t = p.read_text(encoding="utf-8")
        if new and new in t:  # already applied (the fork text can contain the upstream text, so check it first)
            continue
        if old in t:
            p.write_text(t.replace(old, new, 1), encoding="utf-8")
        elif new:
            missing.append(f"{rel}: {old.strip()[:70]}")
    if missing:
        sys.exit("rail: upstream changed these lines; update RAIL_PATCHES in mimir/rebrand.py:\n  " + "\n  ".join(missing))
    print("icon rail mounted")


if __name__ == "__main__":
    only = set(sys.argv[1:])
    for name, fn in (("enterprise", step_enterprise), ("rename", step_rename), ("locales", step_locale_hashes), ("fixed", step_fixed),
                     ("notices", step_notices), ("icons", step_icons),
                     ("mascot", step_mascot), ("services", step_services), ("theme", step_theme), ("rail", step_rail)):
        if not only or name in only:
            fn()
