import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PublishedPageRecord } from "../pages/store.ts";
import { FAKE_DESKTOP_TOKEN, FAKE_TOKEN_URL, fakePagesService } from "../testing/fake-pages.ts";
import { applyIncludedPagesMessage } from "../pages/access.ts";
import { createPublishedPages } from "../pages/service.ts";
import { createPublishedAppsRoutes } from "./published-apps.ts";
import { PASS, type RouteContext, type RouteHandler } from "./table.ts";

const pageId = (letter: string) => letter.repeat(24);
const record = (letter: string, overrides: Partial<PublishedPageRecord> = {}): PublishedPageRecord => ({
  pageId: pageId(letter), url: `https://${pageId(letter)}.mimirbot.invalid/`, title: `Page ${letter}`, botId: "bot-1", source: `app:${letter}`,
  cards: [], createdAt: 1, updatedAt: 100, ...overrides,
});

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "omb-published-apps-")); });
afterEach(() => {
  applyIncludedPagesMessage({ type: "openmausbot:included-pages", access: null });
  rmSync(dir, { recursive: true, force: true });
});

function setup(pages: PublishedPageRecord[] = []) {
  const dataDir = join(dir, "data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "published-pages.json"), JSON.stringify({ version: 1, pages }));
  const fake = fakePagesService();
  const service = createPublishedPages({ dataDir, cloudHome: null, patch: () => {}, fetch: (input, init) => fake.fetch(input, init) });
  const route = createPublishedAppsRoutes({
    list: service.listPublishedApps,
    remove: service.deletePublishedApp,
    botName: (botId) => ({ "bot-1": "Mira" } as Record<string, string>)[botId],
  });
  return { fake, service, route };
}

async function call(handler: RouteHandler, path: string, method = "GET") {
  const sent: { status?: number; body?: any } = {};
  const out = await handler({
    path, method, res: {},
    json: (_res: unknown, status: number, body: unknown) => { sent.status = status; sent.body = body; },
  } as unknown as RouteContext);
  return { out, ...sent };
}

describe("GET /api/published-apps", () => {
  it("lists live pages newest first, with the publishing bot, its thread and an empty name once that bot is gone", async () => {
    const { route } = setup([
      record("a", { title: "Old", updatedAt: 100 }),
      record("b", { title: "Newest", botId: "gone", updatedAt: 300, cards: [{ threadId: "thread-2", messageId: "m2" }] }),
      record("c", { title: "Middle", updatedAt: 200 }),
    ]);
    const answer = await call(route, "/api/published-apps");
    expect(answer.status).toBe(200);
    expect(answer.body.apps.map((app: { title: string }) => app.title)).toEqual(["Newest", "Middle", "Old"]);
    expect(answer.body.apps[0]).toEqual({
      id: pageId("b"), title: "Newest", url: `https://${pageId("b")}.mimirbot.invalid/`,
      bot: { id: "gone", name: "" }, threadId: "thread-2", publishedAt: 300,
    });
    expect(answer.body.apps[1]).toMatchObject({ bot: { id: "bot-1", name: "Mira" }, publishedAt: 200 });
    expect(answer.body.apps[1]).not.toHaveProperty("threadId");
  });

  it("answers an empty list when nothing is live", async () => {
    const { route } = setup();
    expect(await call(route, "/api/published-apps")).toMatchObject({ status: 200, body: { apps: [] } });
  });

  it("passes anything that is not its own path", async () => {
    const { route } = setup();
    expect((await call(route, "/api/published-apps/framing")).out).toBe(PASS);
    expect((await call(route, "/api/published-apps", "POST")).out).toBe(PASS);
  });
});

describe("DELETE /api/published-apps/<pageId>", () => {
  it("takes a published page down and removes it from the list only after the service answered", async () => {
    const { fake, service, route } = setup();
    applyIncludedPagesMessage({ type: "openmausbot:included-pages", access: { url: FAKE_TOKEN_URL, token: FAKE_DESKTOP_TOKEN } });
    const published = await service.publisher.publishFiles({
      botId: "bot-1", threadId: "thread-1", title: "Bake sale", source: "app:thread-1/m1", post: () => "m1",
      files: [{ path: "index.html", data: Buffer.from("<h1>Bake sale</h1>") }],
    });
    expect(published.status).toBe(200);
    const id = published.card!.pageId!;
    expect((await call(route, "/api/published-apps")).body.apps).toHaveLength(1);
    expect(await call(route, `/api/published-apps/${id}`, "DELETE")).toMatchObject({ status: 200, body: { ok: true } });
    expect(fake.pages.size).toBe(0);
    expect((await call(route, "/api/published-apps")).body.apps).toEqual([]);
  });

  it("keeps the row and answers the server's message when the pages service refuses", async () => {
    const { fake, route } = setup([record("a")]);
    applyIncludedPagesMessage({ type: "openmausbot:included-pages", access: { url: FAKE_TOKEN_URL, token: FAKE_DESKTOP_TOKEN } });
    fake.state.down = true;
    const answer = await call(route, `/api/published-apps/${pageId("a")}`, "DELETE");
    expect(answer).toMatchObject({ status: 503, body: { error: "Publishing isn't available right now. Try again in a few minutes." } });
    expect((await call(route, "/api/published-apps")).body.apps.map((app: { id: string }) => app.id)).toEqual([pageId("a")]);
  });

  it("answers 404 for a page this server never published, without calling the pages service", async () => {
    const { fake, route } = setup();
    expect(await call(route, `/api/published-apps/${pageId("z")}`, "DELETE")).toMatchObject({ status: 404, body: { error: "No such published app." } });
    expect(fake.minted).toEqual([]);
  });

  it("answers 404 for an id that is not a page id", async () => {
    const { route } = setup([record("a")]);
    expect(await call(route, "/api/published-apps/short", "DELETE")).toMatchObject({ status: 404, body: { error: "No such published app." } });
  });
});
