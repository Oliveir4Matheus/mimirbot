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
    r"openmausbot\.(com|test|invalid|local)|mausbot\.(com|page|si)",
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
    (re.compile(r"OpenMausBot"), NAME),
    (re.compile(r"OpenMaus(?![a-z])"), NAME[: -len("Bot")] if NAME.endswith("Bot") else NAME),
    (re.compile(r"\bMausBot\b"), SHORT),
    (re.compile(r"(?<![\w.])\.openmausbot(?![\w.])"), "." + SLUG),
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


if __name__ == "__main__":
    only = set(sys.argv[1:])
    for name, fn in (("enterprise", step_enterprise), ("rename", step_rename), ("locales", step_locale_hashes), ("fixed", step_fixed),
                     ("notices", step_notices), ("icons", step_icons)):
        if not only or name in only:
            fn()
