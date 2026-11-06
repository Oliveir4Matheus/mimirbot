# Cua Driver redistribution records

These files accompany the exact Cua Driver `0.40.6` Linux x64 runtime bundled by OpenMausBot. The upstream release archive omits its own license, the embedded Inter font license, a dependency notice, an SBOM, and artifact provenance, so they are preserved here and verified during packaging.

Trust anchor:

- upstream commit: `6d840c54da418192fc2f4fd61b7140893da24a2d`;
- archive: `cua-driver-rs-0.40.6-linux-x86_64-binary.tar.gz`;
- archive SHA-256: `0b3d4913773a88c46bbceb364809254a6ca636e285e81392b69c0c86d42cb922`;
- driver SHA-256: `a8725010f2a01c9b2fbc9a6a6c256a5e15f1ea9e697ea81467ca6dc6d56ac46c`;
- cursor-theme SHA-256: `ff85cf18817f0dbcbe2f55446a767ba60a9d2717c268579e526d278e9ec18562`;
- upstream `Cargo.lock` SHA-256: `af5def22320e4ad2532d4cd5c64eae0dcff68de6079017d6bd3a86b3de024ffc`;
- embedded Inter `4.001` SHA-256: `29160a80ff49ddcab2c97711247e08b1fab27a484a329ce8b813d820dc559031`.

`THIRD_PARTY_NOTICES.md`, `THIRD_PARTY_LICENSES.html`, and `SBOM.cdx.json` are generated from two root-scoped `cargo-about 0.8.4` JSON reports. Do not feed the virtual workspace's raw `cargo metadata` graph to the generator: Cargo unifies features enabled by unrelated workspace members, which overstates the two release binaries.

The official [`cargo-about-0.8.4-x86_64-unknown-linux-musl.tar.gz`](https://github.com/EmbarkStudios/cargo-about/releases/download/0.8.4/cargo-about-0.8.4-x86_64-unknown-linux-musl.tar.gz) archive used for the reviewed output has SHA-256 `c7381aa0cdc41fc0ee662cec8daa260da7817ad8ddea04cd4ddad425460adf14`. From the exact upstream checkout's `libs/cua-driver/rust` directory, run:

```bash
cargo-about generate \
  --locked \
  --target x86_64-unknown-linux-gnu \
  --manifest-path crates/cua-driver/Cargo.toml \
  --features portal-input \
  --config /path/to/OpenMausBot/third_party/cua-driver/about.toml \
  --format json \
  > cua-driver.cargo-about.json

cargo-about generate \
  --locked \
  --target x86_64-unknown-linux-gnu \
  --manifest-path crates/cursor-theme-cli/Cargo.toml \
  --config /path/to/OpenMausBot/third_party/cua-driver/about.toml \
  --format json \
  > cursor-theme.cargo-about.json

node /path/to/OpenMausBot/scripts/generate-cua-sbom.mjs \
  cua-driver.cargo-about.json \
  cursor-theme.cargo-about.json \
  Cargo.lock \
  /path/to/OpenMausBot/third_party/cua-driver
```

The generator fails unless the reports contain the reviewed root-scoped sets: 376 registry packages for the driver, 239 for the cursor-theme sidecar, and a 381-package union. The final CycloneDX inventory contains those 381 packages, nine Cua workspace packages, and the embedded Inter font. The MPL-2.0 set is exactly seven packages. Regeneration is expected to produce a reviewed diff; no release process accepts new native inputs automatically.

OpenMausBot ships only the CLI and cursor-theme sidecar. The Linux SDK `.so`, Node `.node`, ABI header, and GNOME helper are not included in Phase 5 because the current runtime does not load them and must not silently install a Shell extension.
The app's npm Cua SDK is used by the separate macOS integration and may have a different version; it is not loaded by this Linux CLI-spawn runtime.
