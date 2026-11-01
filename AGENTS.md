# MimirBot agent notes

Before claiming a server or conversation change works, follow
[`docs/verification/README.md`](docs/verification/README.md). Always launch an
isolated fixture; never verify mutations against the user's live app or data.

## Comments

Write a comment only for what the code cannot say:

- a license or attribution notice;
- a fact forced by something outside this code (a vendor, CLI, OS, browser,
  Electron or protocol behaviour), with its version when it has one;
- the doc comment of a public contract: the wire types in `shared/`, the
  driver interface, the preload bridge, `config.json` fields people edit;
- a link to an upstream issue;
- a security invariant or a known open risk.

Do not narrate what the next line does, restate a name, record history ("used
to", "no longer", PR or issue numbers, plan or slice names: git has it), point
at other files, draw banners or leave commented-out code. When our own code
needs a paragraph to explain a surprise, change the code instead: a better
name, a type, an extracted function, one shared helper. A rule ("never X",
"must match Y") belongs in a type, a test or a lint rule. Never suppress a lint
rule that guards correctness; fix the code.

More specific `AGENTS.md` files override this note within their directories.

## Shipping an approved change

Any change the owner approves ships to GitHub through the in-app updater, so
installed apps get it from the update button without rebuilding:

1. Raise `version` in `package.json` (patch for fixes; installed apps only
   offer a version greater than theirs).
2. Commit on the `mimirbot` branch and push it to `origin`
   (`Oliveir4Matheus/mimirbot`, public).
3. `pnpm package:linux` writes `release/MimirBot-<version>-x86_64.AppImage`
   and `release/latest-linux.yml`.
4. Push the tag (`git tag v<version> && git push origin v<version>`), then
   `gh release create v<version> -R Oliveir4Matheus/mimirbot --verify-tag
   release/MimirBot-<version>-x86_64.AppImage release/latest-linux.yml
   release/MimirBot-<version>-amd64.deb` (add the `.blockmap` when the build
   emits one). Always pass `-R Oliveir4Matheus/mimirbot`: without it `gh`
   resolves the `upstream` remote (`milind-soni/OpenMausBot`, not ours) as the
   target. The AppImage and `latest-linux.yml` must come from the same build; a
   release without `latest-linux.yml` leaves every install on its current
   version.
5. Every update carries its tag, `v<version>`, on the pushed commit the build
   came from, so anyone can build that exact version with
   `git checkout v<version> && pnpm install && pnpm package:<win|mac|linux>`.
   Check with `git ls-remote --tags origin`; never release from unpushed code.

Windows (`latest.yml` + NSIS `.exe`) needs its own build on Windows:
`.github/workflows/package-win.yml` builds it on `windows-latest`, and
`fork-release.yml` calls it with `publish: true` after the Linux job, so one
tag ships both platforms from the same commit. Without `latest.yml` on the
release every Windows install reports "up to date" against a feed that
describes an older build. macOS (`latest-mac.yml` + `.zip`, signed and
notarized) still needs its own build on a Mac. Do not use
`.github/workflows/release.yml`: it needs the upstream project's Apple signing
secrets.
