import { expect, it } from "vitest";

import { launchCloudSendFixture } from "../scripts/testing/cloud-send-fixture.ts";
import { hostTimeout } from "./testing/host-timeout.ts";

it("gives a member the same 404 for missing and hidden bots with invalid handoff bodies", async () => {
  const fixture = await launchCloudSendFixture({ onePasswordToken: "synthetic-owner-lookup-token",
    team: { id: "team-owner-lookup", name: "Owner lookup" } });
  try {
    const team = fixture.team!;
    const owner = await team.pair({ email: "ada@guards.test", role: "owner" });
    const member = await team.pair({ email: "bob@guards.test", role: "member" });
    const created = await team.as(owner.token!, "POST", "/api/bots", { name: "Private Scout", visibility: "admins" });
    expect(created.status).toBe(201);
    for (const id of [created.body.bot.id, "missing-bot"]) {
      const response = await team.as(member.token!, "PUT", `/api/bots/${id}/reports-to`, {});
      expect(response, id).toEqual({ status: 404, body: { error: "no such bot" } });
    }
  } finally {
    await fixture.close();
  }
}, hostTimeout(120_000));
