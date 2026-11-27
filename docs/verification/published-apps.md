# Published apps

The Published apps panel lists every live page this server published, beside the chat. It is the person's side of
`publish_page` and a chat page's Share: each card shows the page's link, its bot and when it was last published, with
Preview, Open, Copy link and Delete. Preview draws the page in a sandboxed frame inside the panel. Delete asks first and
takes the published link down for good.

## Automated checks

```sh
pnpm exec vitest run server/routes/published-apps.test.ts src/components/published-apps src/lib/published-apps.test.ts src/lib/composer-commands.test.ts
```

The route test seeds `published-pages.json` in a temporary data dir and uses `server/testing/fake-pages.ts`:
the list is newest first, a deleted bot's page answers with an empty name, Delete calls the pages service and drops the
row only on 200, a refusal keeps the row and returns the service's message, and an unknown or malformed id answers 404.

The renderer tests cover the loading, empty, list and failed states, the preview frame's sandbox, Copy link/Open, the
confirmation, a deleted row and a refused delete. `src/lib/published-apps.test.ts` pins the frame to
`allow-scripts allow-same-origin allow-forms allow-popups` and to `camera 'none'; microphone 'none'; geolocation 'none';
display-capture 'none'; clipboard-read 'none'; autoplay 'none'`, and proves a page on the app's own origin is never
framed.

## Isolated fixture

Start a throwaway instance so none of this touches the person's data:

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Keep the printed URL and data directory. Either sign this fixture in to a MimirBot account and publish a page with
`publish_page`, or seed one live record in the fixture's `published-pages.json` (`DATA_DIR` from the launcher) and
restart the fixture:

```json
{
  "version": 1,
  "pages": [{
    "pageId": "abcdefghijklmnopqrstuvwxyz",
    "url": "https://abcdefghijklmnopqrstuvwxyz.mimirbot.invalid/",
    "title": "Bake sale",
    "botId": "BOT_ID",
    "source": "app:THREAD/m1",
    "cards": [{ "threadId": "THREAD", "messageId": "m1" }],
    "createdAt": 1762776000000,
    "updatedAt": 1762776000000
  }]
}
```

Replace `BOT_ID` and `THREAD` with the fixture bot's ids. Then:

1. Open the fixture URL, pick that bot's chat and click `⋯` → **Published apps**. The right-hand panel opens with the
   card; the `⋯` button is lit while it is open.
2. Click **Preview**: the card row is replaced by the page's title, host, Reload, Open in browser, Back and Close. The
   frame carries the sandbox above and the app's own origin is refused with Open in browser instead.
3. Click **Back**, then **Open** and **Copy link**; they act outside the panel. Click **Delete**, read the confirmation
   ("This takes its published link down"), cancel once, then confirm: the card disappears and the link no longer opens.
4. With the panel open, open Computer, Activity, Inspector and bot Settings in turn. Each closes Published apps; opening
   Published apps again closes them.
5. Type `/create-apps` in the composer. The picker offers it; choosing it inserts `/create-apps ` and sends as an
   ordinary message. With a bot name after it the bot builds a page with `show_html` and says it can be published from
   the card; with no name it asks one short question.
