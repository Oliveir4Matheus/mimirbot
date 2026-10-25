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

Edit `mimir/config.json` (`name`, `slug`, `icon`), then run `python3 mimir/rebrand.py` on a fresh checkout of upstream
(`git checkout upstream/main -- . && python3 mimir/rebrand.py`), because renaming from an already renamed tree does not
undo the previous name. Icon only: `python3 mimir/rebrand.py icons`.

## Licensing

The original copyright and license notices are kept in `LICENSE` and `NOTICE`. The name, mascot and logos of the
original project are not used here.
