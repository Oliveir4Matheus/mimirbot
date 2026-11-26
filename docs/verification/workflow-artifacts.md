# Run files: list, preview and download

Checks that the run screen lists the files each step and each Do While round
left in `output/`, that the preview serves text, Markdown, JSON, CSV, images,
PDF, audio and video safely, that HTML/SVG never render inline, that Range and
HEAD behave, that the zip groups the steps, and that nothing can be read outside
the origin's `output/`. Everything runs against a disposable fixture
(`scripts/control-omb.ts launch`); it never touches the installed app or its
data.

## 1. Focused tests

```sh
pnpm exec vitest run server/workflows/artifacts.test.ts server/workflows/archive.test.ts \
  server/routes/workflows.test.ts src/components/workflows/ArtifactsPanel.test.tsx
pnpm typecheck
pnpm lint
pnpm i18n:check
```

The unit suite covers the scan (origins validated against `run.json`, ignored
folders, `verified`, 2.000-file cap, Unicode and 200/201-character paths, a
round the run never recorded, `expiresAt`); the archive covers stored entries,
collisions and both caps; the route suite covers `200/400/404/405/413/416`, HEAD,
Range, accents, HTML/SVG, symlinks, a linked folder, a removed run and both zip
caps; the component covers the empty/error/removed/running states, the keyboard,
each preview type and the encoded download links.

## 2. Fixture

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Note the printed `url`, `dataDir` and log path. In another terminal:

```sh
URL=http://127.0.0.1:<printed-port>
BOT=$(curl -sS "$URL/api/bots" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).bots[0].id))')
```

Create a Workflow whose script steps write the files (the fake engine does not
write files on its own) and whose Do While body writes `result.json` per round:

```sh
mkdir -p /tmp/opencode/wf-artifacts
cat > /tmp/opencode/wf-artifacts/relatorio.mjs <<'JS'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const out = process.env.WORKFLOW_STEP_OUTPUT;
writeFileSync(join(out, "dados.csv"), "nome,total\nana,10\nbia,7\n");
writeFileSync(join(out, "resumo.md"), "# Resumo\n\nTudo certo.\n");
writeFileSync(join(out, "relatorio final.pdf"), "%PDF-1.4\n% fixture\n");
writeFileSync(join(out, "pagina.html"), "<script>alert(1)</script>\n");
writeFileSync(join(out, "icone.svg"), "<svg onload=\"alert(1)\"/>\n");
writeFileSync(join(out, "grande.txt"), "a".repeat(300 * 1024));
JS
cat > /tmp/opencode/wf-artifacts/volta.mjs <<'JS'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "result.json"), JSON.stringify({ restantes: 0 }));
JS
cat > /tmp/opencode/wf-artifacts/falha.mjs <<'JS'
import { writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(join(process.env.WORKFLOW_STEP_OUTPUT, "parcial.txt"), "escrito antes da falha\n");
process.exit(1);
JS
```

Save it with the two scripts in the same body. `id` is a fresh UUID; `step 1`
writes the report, `step 2` is a Do While whose body writes `result.json` per
round and stops after one round:

```sh
cat > /tmp/opencode/wf-artifacts/save.json <<JSON
{
  "id": "$(node -e 'console.log(crypto.randomUUID())')",
  "name": "Arquivos da execucao",
  "department": "Financeiro",
  "retentionDays": 7,
  "steps": [
    { "id": "coletar", "kind": "script", "name": "Coletar", "run": "relatorio.mjs", "outputs": [{ "path": "dados.csv" }, { "path": "resumo.md" }, { "path": "relatorio final.pdf" }, { "path": "pagina.html" }, { "path": "icone.svg" }, { "path": "grande.txt" }] },
    { "id": "laco", "kind": "loop", "name": "Do While", "maxIterations": 2,
      "body": [{ "id": "preparar", "kind": "script", "name": "Preparar", "run": "volta.mjs", "outputs": [{ "path": "result.json", "shape": { "type": "object" } }] }],
      "from": { "step": "preparar", "output": "result.json" },
      "conditions": [{ "field": "restantes", "op": "lte", "value": 0 }],
      "outputs": [{ "path": "result.json", "shape": { "type": "object" } }] }
  ],
  "scripts": [
    { "name": "relatorio.mjs", "content": $(node -e 'console.log(JSON.stringify(require("fs").readFileSync("/tmp/opencode/wf-artifacts/relatorio.mjs","utf8")))') },
    { "name": "volta.mjs", "content": $(node -e 'console.log(JSON.stringify(require("fs").readFileSync("/tmp/opencode/wf-artifacts/volta.mjs","utf8")))') }
  ]
}
JSON
ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("/tmp/opencode/wf-artifacts/save.json","utf8")).id)')
curl -sS -X PUT "$URL/api/workflows/$ID" -H 'content-type: application/json' --data @/tmp/opencode/wf-artifacts/save.json
```

The save uploads `scripts/` before validating the steps, so the two files exist
when the definition is checked. Start the run and poll it:

```sh
RUN=$(curl -sS -X POST "$URL/api/workflows/$ID/run" -H 'content-type: application/json' -d '{}' \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).run.id))')
until curl -sS "$URL/api/workflows/runs/$RUN" | grep -Eq '"status":"(succeeded|failed|cancelled)"'; do sleep 1; done
```

For the failure case, save a second Workflow whose `step 1` is the `falha.mjs`
script and run it: `parcial.txt` must appear with `"status": "failed"`.

## 3. List and headers

```sh
curl -sS "$URL/api/workflows/runs/$RUN/artifacts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.stringify(JSON.parse(s),null,2)))'
```

Expect `sources` for `step-1` and `step-2`/`iter-1/preparar`; `dados.csv` is
`csv`/`text/csv`, `resumo.md` is `markdown`, `grande.txt` is `text`, the two
`result.json` are `json`, and the PDF/HTML/SVG keep their own types. `verified`
is true for the declared files and false for any extra file. `expiresAt` is
`finishedAt + 7 days`.

```sh
curl -sD- -o /dev/null "$URL/api/workflows/runs/$RUN/artifact?step=1&path=dados.csv"
# 200, text/csv; charset=utf-8, content-disposition: inline, nosniff,
# content-security-policy: sandbox, cache-control: private, no-store,
# accept-ranges: bytes

curl -sD- -o /dev/null -H 'Range: bytes=0-9' "$URL/api/workflows/runs/$RUN/artifact?step=1&path=dados.csv"
# 206, content-range: bytes 0-9/<bytes>

curl -sD- -o /dev/null -H 'Range: bytes=999999-' "$URL/api/workflows/runs/$RUN/artifact?step=1&path=dados.csv"
# 416, content-range: bytes */<bytes>

curl -sD- -o /dev/null -I "$URL/api/workflows/runs/$RUN/artifact?step=1&path=dados.csv"
# the same headers, no body
```

The 300 KB text comes back cut at 256 KB with `x-artifact-truncated: 1`; a
`Range` request returns the whole-file slice instead.

## 4. Safety

```sh
# HTML and SVG are source, never documents.
curl -sD- -o /dev/null "$URL/api/workflows/runs/$RUN/artifact?step=1&path=pagina.html"
# content-type: text/plain; charset=utf-8, content-disposition: attachment, nosniff

curl -sD- -o /dev/null "$URL/api/workflows/runs/$RUN/artifact?step=1&path=relatorio%20final.pdf&disposition=download"
# content-disposition carries filename*=UTF-8''relat%C3%B3rio%20final.pdf

# Traversal and the step's input/ never resolve.
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/workflows/runs/$RUN/artifact?step=1&path=../run.json"      # 400
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/workflows/runs/$RUN/artifact?step=1&path=input/params.json" # 404

# A link inside output/ is refused like a missing file.
RUN_DIR="$DATADIR/MimirBot/Financeiro/workflows/$ID/runs/$RUN"
ln -s /etc/passwd "$RUN_DIR/step-1/output/link.txt"
```

`DATADIR` is the `dataDir` the launcher printed; the fixture's `HOME` is that
same folder, so a run lives under `$DATADIR/MimirBot/<department>/workflows/<id>/runs/<runId>`.

Then:

```sh
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/workflows/runs/$RUN/artifact?step=1&path=link.txt" # 404
```

Delete the fixture's run folder and list again: the list and the zip answer
`404`, without a stack or a `500`.

## 5. Zip

```sh
curl -sS "$URL/api/workflows/runs/$RUN/artifacts.zip" -o /tmp/opencode/wf-artifacts/run.zip
unzip -t /tmp/opencode/wf-artifacts/run.zip
unzip -l /tmp/opencode/wf-artifacts/run.zip
# step-1/..., step-2/result.json, step-2/iter-1/preparar/result.json

curl -sS "$URL/api/workflows/runs/$RUN/artifacts.zip?step=2" -o /tmp/opencode/wf-artifacts/step-2.zip
unzip -l /tmp/opencode/wf-artifacts/step-2.zip   # only step-2/...
```

The zip is store-only, so `unzip -t` is fast and the Windows Explorer opens it
as a normal folder tree. A run with more than 2.000 entries or 512 MiB answers
`413` with the `limit` before sending a byte.

## 6. Screen

`OMB_UI_PORT=5401 OMB_PORT=<printed-port> pnpm dev`, then open **Workflows →
Executions → the run**:

1. **Arquivos da execução** sits between the timeline and **Resultado**, with
   the file count and the total size.
2. Each group shows the step or “Do While · round N · body”; each row shows the
   type chip, the name, the size, the green check when the engine verified it,
   **Abrir** and **Baixar**.
3. `Tab` reaches a row; `↑`/`↓` move, `Enter` opens, `Esc` closes and returns
   focus to that row.
4. Open the CSV (table), the Markdown (rendered), the JSON (pretty text), the
   PDF (embedded), the HTML (source, not a page), the SVG (source), and a large
   file (the “too large” notice with **Baixar** and no request).
5. **Baixar** downloads with the accented name; **Baixar tudo .zip** shows
   `aria-busy` while it prepares and downloads `run-<id>.zip`.
6. Narrow the window to 390 px: the preview takes the whole sheet, the row
   itself opens it, and the download stays in the footer.
7. Start another run and leave it running: the panel shows **atualiza sozinho**
   and reloads on `workflow.run` frames.

## 7. Retention

Stop the fixture. Edit the run's `run.json` to set `createdAt` three days ago,
set the Workflow's `retentionDays` to `1`, and launch again (upkeep prunes on
startup). The run folder is gone: the list, the file route and the zip all
answer `404` `no such run`.
