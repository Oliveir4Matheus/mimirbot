import { beforeEach, describe, expect, it } from "vitest";

import { clearPlanUsageCache, loadPlanUsage, type PlanAccount, type PlanFetch, type PlanResponse } from "./plan-usage.ts";

const NOW = 1_800_000_000_000;
const claude: PlanAccount = { id: "claude", name: "Claude", driver: "claude", environment: {} };
const credentials = { read: () => ({ token: "plan-usage-fixture-secret", accountId: null, expired: false }) };

function respond(status: number, body: unknown = {}): PlanResponse {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

const reading = respond(200, {
  five_hour: { utilization: 7, resets_at: "2027-01-15T12:00:00.000Z" },
  seven_day: { utilization: 90, resets_at: "2027-01-17T00:00:00.000Z" },
});

async function load(status: number, at: number) {
  const fetch: PlanFetch = async () => (status === 200 ? reading : respond(status));
  return (await loadPlanUsage({ accounts: [claude], refresh: true, now: at, fetch, credentials })).providers[0]!;
}

beforeEach(() => {
  clearPlanUsageCache();
});

describe("a usage endpoint that refuses a poll", () => {
  it("keeps the last good reading through a rate limit, so the engine stays in the rings and the warnings", async () => {
    expect((await load(200, NOW)).weekly.usedPercent).toBe(90);
    const refused = await load(429, NOW + 60_000);
    expect(refused.ok).toBe(true);
    expect(refused.weekly.usedPercent).toBe(90);
  });

  it("lets the error through once the reading is half an hour old", async () => {
    await load(200, NOW);
    expect((await load(429, NOW + 31 * 60_000)).ok).toBe(false);
  });

  it("still asks the person to sign in again when the login is rejected", async () => {
    await load(200, NOW);
    const rejected = await load(401, NOW + 60_000);
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toMatch(/Sign in again/);
  });
});
