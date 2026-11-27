/** One page this server published, as GET /api/published-apps lists it for the Published apps panel. */
export interface PublishedApp {
  /** The page id at the end of its link. */
  id: string;
  title: string;
  url: string;
  /** The bot that published it; `name` is empty once that bot is gone. */
  bot: { id: string; name: string };
  /** The most recent conversation where a card shows it, when one is known. */
  threadId?: string;
  /** When it was last published or updated, in milliseconds. */
  publishedAt: number;
}

export interface PublishedAppsList {
  apps: PublishedApp[];
}
