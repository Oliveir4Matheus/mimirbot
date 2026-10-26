import { afterEach, describe, expect, it, vi } from "vitest";
import { installMissingRuntime, type MissingRuntimeDeps } from "./antigravity.ts";
import { AntigravitySetupError } from "./antigravity-runtime.ts";

const notInstalled = () => Promise.reject(new AntigravitySetupError("Antigravity is not installed."));

function deps(overrides: Partial<MissingRuntimeDeps> = {}): MissingRuntimeDeps {
  return {
    managedInstallAvailable: () => true,
    signedIn: async () => true,
    resolve: notInstalled,
    install: vi.fn(async () => undefined),
    ...overrides,
  };
}
const input = { instanceId: "antigravity", cli: undefined, env: {} };

afterEach(() => vi.unstubAllEnvs());

describe("installing the pinned Antigravity runtime after an update", () => {
  it("installs it when the person is signed in and the runtime is missing", async () => {
    const d = deps();
    expect(await installMissingRuntime(input, d)).toBeNull();
    expect(d.install).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the runtime is already there", async () => {
    const d = deps({ resolve: async () => ({}) });
    expect(await installMissingRuntime(input, d)).toBeNull();
    expect(d.install).not.toHaveBeenCalled();
  });

  it("leaves a new person to choose Install, instead of downloading 337 MB unasked", async () => {
    const d = deps({ signedIn: async () => false });
    expect(await installMissingRuntime(input, d)).toBeNull();
    expect(d.install).not.toHaveBeenCalled();
  });

  it("never installs over an executable the person chose", async () => {
    const d = deps();
    expect(await installMissingRuntime({ ...input, cli: "/opt/my-acp/agy_acp_server" }, d)).toBeNull();
    expect(d.install).not.toHaveBeenCalled();
  });

  it("still installs for the old agy path, which now means the managed runtime", async () => {
    const d = deps();
    await installMissingRuntime({ ...input, cli: "agy" }, d);
    expect(d.install).toHaveBeenCalledTimes(1);
  });

  it("does nothing where Google publishes no runtime, or in a sealed test fixture", async () => {
    const none = deps({ managedInstallAvailable: () => false });
    await installMissingRuntime(input, none);
    expect(none.install).not.toHaveBeenCalled();
    vi.stubEnv("OMB_TEST_SEALED_PATH", "1");
    const sealed = deps();
    await installMissingRuntime(input, sealed);
    expect(sealed.install).not.toHaveBeenCalled();
  });

  it("does not install on an error that is not a missing runtime", async () => {
    const d = deps({ resolve: () => Promise.reject(new Error("disk unreadable")) });
    expect(await installMissingRuntime(input, d)).toBeNull();
    expect(d.install).not.toHaveBeenCalled();
  });

  it("returns the failure when the install fails, instead of throwing", async () => {
    const d = deps({ install: async () => { throw new Error("download interrupted"); } });
    expect(await installMissingRuntime(input, d)).toBe("download interrupted");
  });
});
