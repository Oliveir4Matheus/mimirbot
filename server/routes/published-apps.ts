// The Published apps panel's list and Delete. Both answer for this server's own pages, so only an admin session reaches
// them: neither path is in request-auth.ts CLIENT_ALLOW.
import type { PublishedApp } from "../../shared/published-apps.ts";
import { PAGE_ID } from "../../shared/published-page.ts";
import { PASS, type RouteHandler } from "./table.ts";

const DELETE_ROUTE = /^\/api\/published-apps\/([^/]+)$/;

export interface PublishedAppsRoutesDeps {
  /** Live pages newest first; `botName` reads a bot's name, empty once it is gone. */
  list(botName: (botId: string) => string | undefined): PublishedApp[];
  /** Unpublishes a page this server published, or answers 404 for an unknown id. */
  remove(pageId: string): Promise<{ status: number; text: string }>;
  botName(botId: string): string | undefined;
}

/** GET /api/published-apps: the live pages this server published. DELETE /api/published-apps/<pageId>: takes one down. */
export function createPublishedAppsRoutes(deps: PublishedAppsRoutesDeps): RouteHandler {
  return async ({ path, method, res, json }) => {
    if (path === "/api/published-apps" && method === "GET") {
      return void json(res, 200, { apps: deps.list(deps.botName) });
    }
    const match = method === "DELETE" ? DELETE_ROUTE.exec(path) : null;
    if (!match) return PASS;
    const pageId = match[1]!;
    if (!PAGE_ID.test(pageId)) return void json(res, 404, { error: "No such published app." });
    const outcome = await deps.remove(pageId);
    return void json(res, outcome.status, outcome.status === 200 ? { ok: true } : { error: outcome.text });
  };
}
