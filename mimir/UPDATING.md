# Keeping MimirBot up to date with OpenMausBot

MimirBot is a fork of [OpenMausBot](https://github.com/milind-soni/OpenMausBot) (Apache-2.0).

## Branches and remotes

| Name | Role |
|---|---|
| `main` | Exact mirror of `upstream/main`. Never commit here. |
| `mimirbot` | `main` plus the fork changes. This is the branch you build and run. |
| `origin` | This fork (`Oliveir4Matheus/mimirbot`). |
| `upstream` | The original project. |

## What the fork changes

Everything is produced by `mimir/rebrand.py` from `mimir/config.json` and `mimir/assets/`, so the changes can be reapplied on
any upstream version:

1. Deletes `enterprise/` (Enterprise License, not redistributable). The OSS build does not need it.
2. Renames the product to the name in `config.json` (display strings, `productName`, `appId`, `~/.mimirbot` data dir,
   executable and `.deb` name) and leaves alone every URL that points at an upstream service.
3. Points auto-update (`electron-builder.yml`) and the update check (`server/update-check.ts`) at this fork's releases.
4. Regenerates the app icons from `mimir/assets/icons/<config.icon>`.
5. Adds the fork notice to `README.md`, `NOTICE` and `SECURITY.md`.
6. Welcome mascot: the default brand (`DEFAULT_BRAND` in `server/brand.ts` and `src/lib/brand.ts`) carries the logo
   from `mimir/assets/icons/<config.mascot>`, which the welcome screen shows instead of the upstream mascot.
7. The original author's hosted services are disabled: every host (`*.openmausbot.com`, `mausbot.page`, `mausbot.si`,
   `omb-*.fly.dev`, the Composio broker on workers.dev) moves to the reserved `.invalid` TLD, which never resolves. The app
   shows its "Cloud unreachable" states and keeps working locally; nothing is sent to the author. `docs/`, `cloudflare/`,
   `deploy/` and `apps/` (the author's own infrastructure and site) are left as they are. Telemetry (PostHog) is
   **still on**; it will be replaced later.
8. Default skin: Meadow's green brand look becomes Apple's interface blue (`#007AFF` borders, `#0071E3` filled
   accent, `#0062CC` link text, blue-tinted grounds), in the sRGB, display-p3 and mobile-ground blocks and in the dark
   bubble. `node scripts/check-skin-contrast.mjs` must pass; the semantic success color stays green.
9. Icon rail: `src/mimir/MimirRail.tsx` is a 66px rail left of the bot list (Bots, Automations, Schedule, Run logs,
   Team map, Files, Usage; plan-usage rings per engine, Apps, Help, Settings, profile). Step `rail` mounts it in
   `src/App.tsx` and removes the sidebar footer and the collapsed sidebar's tool icons, which the rail replaces; it
   also skips the upstream tests of that footer (`src/mimir/MimirRail.test.ts` covers the new layout). If upstream
   rewrites one of those lines the step stops with the file and line to update in `RAIL_PATCHES`.

Fixed edits that are not branding but follow from it: the prompt-injection guards in `server/peer-provenance.ts` and
`server/records-block.ts` also treat a forged `[MimirBot …]` header as forged, since the app's own notes now use that
name. Run the suite with `LC_ALL=en_US.UTF-8`: some upstream tests format times in the machine locale.

Internal protocol identifiers stay as upstream (`openmausbot://`, `x-openmausbot-*` headers, `OMB_*` / `OPENMAUSBOT_*`
variables, i18n keys) so upstream docs and the companion apps keep working and merges stay small.
`.github/`, `third_party/`, `LICENSE`, `CLA.md` and `LICENSING.md` are never touched.

## Pull upstream changes

```sh
mimir/sync-upstream.sh      # fetch, fast-forward main, merge into mimirbot, rebrand, reinstall
pnpm test                  # or the checks you care about
git push origin main mimirbot
```

If the script stops on a conflict, fix the listed files (when in doubt take upstream's version), run
`python3 mimir/rebrand.py`, `git add -A && git commit`, and push.

## Change the name or the icon

Edit `mimir/config.json` (`name`, `slug`, `icon`, `mascot`, `mascot_crop`), then run `python3 mimir/rebrand.py` on a fresh checkout of upstream
(`git checkout upstream/main -- . && python3 mimir/rebrand.py`), because renaming from an already renamed tree does not
undo the previous name. Icon only: `python3 mimir/rebrand.py icons`.

## Licensing

The original copyright and license notices are kept in `LICENSE` and `NOTICE`. The name, mascot and logos of the
original project are not used here.
