// OpenCode's own builds, for installing it without Node.js: the version `npm install -g @opencode/cli` gives (latest on
// npm, 2026-11-24), from https://github.com/anomalyco/opencode/releases/tag/v2.4.1.
// Anomaly publishes a SHA256SUMS file for this release; each archive SHA-256 below was taken from that file and
// re-measured on 2026-11-24 by downloading the asset and running `sha256sum` on it — both agree. Each size is the byte
// count the GitHub assets API and the finished download agree on. Each program SHA-256 is `sha256sum` of the executable
// unpacked from that same verified archive (`unzip -p` / `tar -xzO`); the app checks it after unpacking, before reusing
// an installed copy and at every start. Earlier pins keep their place in `previousPrograms` (the 1.x line and 2.2.5),
// so copies installed by them stay usable until they update. x64 takes the "baseline" builds, which need no AVX2 (older Intel CPUs,
// Rosetta); a Linux without glibc takes the musl builds. macOS signing was not re-verified for the 2.x line: the Team
// ID is carried over from the 1.x pin and worth a codesign spot-check.
import type { StandaloneRelease } from "../../contracts.ts";

const VERSION = "2.4.1";
const RELEASE = `https://github.com/anomalyco/opencode/releases/download/v${VERSION}`;

export const OPENCODE_STANDALONE: StandaloneRelease = {
  name: "OpenCode",
  engine: "opencode",
  version: VERSION,
  // github.com answers with a redirect to GitHub's release-asset host.
  hosts: ["github.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com"],
  macTeamId: "5NZ4Q7NXJ4",
  // The app installs its own copy's updates; OpenCode's self-updater would replace that copy behind its back.
  runEnv: { OPENCODE_DISABLE_AUTOUPDATE: "1" },
  // Program hashes of earlier pins whose installed copies stay usable after this pin moves on: the 1.x line, whose npm
  // name (`opencode-ai`) the previous install command used.
  previousPrograms: {
    "darwin-arm64": ["417af53923f3d529759ab85ce3e8dd09116f742efcd332de591d2da6ebae696b", "abe4d88594bffb12b364375b8a6732d2d1f7a977195ed1a35c5c76f8e89c9e0e"],
    "darwin-x64": ["362c45dcd36a16215dce88c6b5232fe230f542c25960f01ba4e4a35588f42de9", "f2e7af7237a08e970821aec92c6af95caadeab2fe9f54bd4e76e075d8092d47f"],
    "linux-x64": ["538fcb1b6408c8d4608822acee19f7ff5b3a3eb3383c0633c4f06170857312a7", "8d060e1d2fbb9bb44cf09ae6ed1f3f6a7cff070b5227e2f90970132b23a92050"],
    "linux-arm64": ["eba0da50d9cc22f2dd062c32e0e7e58d7ece301aa50aabdad1e9dba4ffbf25b4", "dcc7e6f4ac1672e1884dcb8d26ab333e55ffc3f080e01a7a60177aa05f54935f"],
    "linux-x64-musl": ["ad5ae0ab7b5f0c6fec273648eb91c798fd49ffe0e3f222dcec3ab2d680b132d8", "8b071dcb704137eb9be83cd84ebd634e9409f9b9aaf9d8e562e1c69941743ce4"],
    "linux-arm64-musl": ["2a0cfa6fe7d96ebb89da8d880bd884598d5cdca10e6c3a5b2e63f92c569f1452", "2d719ef7b593a3e836dab611bc28da0e9ee71958d5e72ddb41e0f6abe2924e14"],
    "win32-x64": ["eba9fc042ac622648a66ac5764c5ad41a73244eabcd7a00527d651b7c443efbd", "17531635c255d2dd70057b8d50564b829349eae8c2946590ce355f003cb251e6"],
    "win32-arm64": ["92c6c5f6f656e60d6809c029a911ecb578204085945dd2f6e2639981ecab8749", "a614cd11e3c98fb57ce2d3a45988f163ec15689269ee4cea64ee7cf6b2d1b1ee"],
  },
  assets: {
    "darwin-arm64": { url: `${RELEASE}/opencode-darwin-arm64.zip`, archive: "zip", executable: "opencode", approxBytes: 115_188_658, sha256: "95a101eda95108478f1db43cff8fcbd4811f6c0e79af1e167301843c6a48d731", executableSha256: "e465e8ad79c632149699878465225aecec183b8a1fb23727f60731f5c11c9cc9" },
    "darwin-x64": { url: `${RELEASE}/opencode-darwin-x64-baseline.zip`, archive: "zip", executable: "opencode", approxBytes: 115_360_638, sha256: "3dd6612423b69f7f282866112d99b6d690c8e07f27375b227f6a6ee4e652f5b5", executableSha256: "73d62b32a3cff17278e52d71309d7451c584d333a208df7ee8b565925a73afb5" },
    "linux-x64": { url: `${RELEASE}/opencode-linux-x64-baseline.tar.gz`, archive: "tar.gz", executable: "opencode", approxBytes: 130_647_866, sha256: "9ddd18e3faf64eaeccf6a0fcbc96a5c7a14520ae5fd5b61e5be51d894f478b47", executableSha256: "ec93043f18f8a6b4d8e71ec9260e292ba6f91b66b142782135d40f0b58b0c152" },
    "linux-arm64": { url: `${RELEASE}/opencode-linux-arm64.tar.gz`, archive: "tar.gz", executable: "opencode", approxBytes: 128_876_799, sha256: "cb28cf94541aeb62a4b2ea5997a99b5dd6bae595a772f36fbe279299f2032a4f", executableSha256: "6495e0563da9966f8c2a2ff564c8561158c5751b65a1dde421b1dcfd43af3b6b" },
    "linux-x64-musl": { url: `${RELEASE}/opencode-linux-x64-baseline-musl.tar.gz`, archive: "tar.gz", executable: "opencode", approxBytes: 130_099_009, sha256: "3d8d0ba66d33e1631ebe61b5539cd2ef971a724ff68eb286554093bf55ba5c9f", executableSha256: "148e45bcdf378c783f12c78e30912d4303402e772de7097e7f5505a5390c3241" },
    "linux-arm64-musl": { url: `${RELEASE}/opencode-linux-arm64-musl.tar.gz`, archive: "tar.gz", executable: "opencode", approxBytes: 127_637_580, sha256: "814d92dc6ce172a382090797df7072b7fe0f2840f2440838228196789c0e352f", executableSha256: "113347f943508c4312ec066de5f1f3c940d8c53a9a67864d340e1d551c9c78c3" },
    "win32-x64": { url: `${RELEASE}/opencode-windows-x64-baseline.zip`, archive: "zip", executable: "opencode.exe", approxBytes: 132_524_449, sha256: "40c4f842398abcba3837d554a2b0ddd9a11c5fae667f198e0bb716d101a2aab4", executableSha256: "70c353635912aac83449e24a950895fcdcc042862c468625739b0a6c79307f28" },
    "win32-arm64": { url: `${RELEASE}/opencode-windows-arm64.zip`, archive: "zip", executable: "opencode.exe", approxBytes: 125_335_322, sha256: "03ccc3d6a9b46ab082cbf7f5f86ff07c4bfcd7b802dbafe1614c257b1a96df8e", executableSha256: "6fb62368674e22154a20b009801833e438ab12dbaf108d0c65cc00823f7de992" },
  },
};
