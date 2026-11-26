# Workflow webhooks: configure, deliver and retry

Checks that a Workflow webhook trigger authenticates before reading the body,
resolves its declared parameter map without coercion, starts exactly one run per
`(triggerId, deliveryId)`, records metadata-only attempts, and refuses a paused
or broken trigger without creating a run. Everything runs against a disposable
fixture (`scripts/control-omb.ts launch`); it never touches the installed app or
its data.

## 1. Focused tests

```sh
pnpm exec vitest run \
  server/workflow-triggers.test.ts \
  server/routes/workflow-triggers.test.ts \
  server/webhook-ingress.workflow-trigger.test.ts \
  shared/workflow-run-trigger.test.ts \
  shared/workflow-triggers.test.ts \
  server/routes/workflows.test.ts
pnpm typecheck
pnpm lint
pnpm i18n:check
```

The manager suite covers the complete map, unknown and `collectedBy` keys,
constant/header/pointer validation, header and query ambiguity, no coercion,
sequential and simultaneous duplicates, the boot rebuild from `run.json`, quota,
endpoint rate, preview without side effects, rotation and the trash. The route
suite covers `201/200/400/404/405/409`, preview `422`, attempts metadata, the
department list without inputs or secrets, and Workflow deletion with
`withTriggers`. The ingress suite covers a real `202`, duplicate `202`, `401`,
`413`, paused and missing-Workflow `409`, and simultaneous identical
deliveries. `shared/workflow-run-trigger.test.ts` reads both origin shapes from
`run.json`.

## 2. Fixture

```sh
node --experimental-strip-types scripts/control-omb.ts launch
```

Note the printed `url` and `dataDir`. In another terminal:

```sh
URL=http://127.0.0.1:<printed-port>
DATA_DIR=<printed dataDir>
BOT=$(curl -sS "$URL/api/bots" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).bots[0].id))')
ID=$(node -e 'console.log(crypto.randomUUID())')
```

Create the Workflow. `customer_id` and `amount` start the run, `sent_at` is an
optional start value, `approved_by` is collected by the manual step, and
`valor_registrado` comes from the first step's `.json` output:

```sh
cat > /tmp/opencode/wfw-save.json <<JSON
{
  "id": "$ID",
  "name": "Pedidos",
  "department": "Financeiro",
  "triggers": [{ "id": "webhook", "kind": "webhook", "name": "Pedidos pagos" }],
  "steps": [
    {
      "id": "receber", "name": "Receber", "botId": "$BOT", "instructions": "Leia o pedido.",
      "parameters": [
        { "name": "customer_id", "type": "string" },
        { "name": "amount", "type": "number" },
        { "name": "sent_at", "type": "date", "required": false, "whenAbsent": "rule:sem_data" }
      ],
      "outputs": [{ "path": "data.json" }]
    },
    {
      "id": "aprovar", "name": "Aprovar", "botId": "$BOT", "mode": "manual", "instructions": "Peca a aprovacao.",
      "parameters": [{ "name": "approved_by", "type": "string", "collectedBy": "aprovar" }],
      "outputs": [{ "path": "ok.json" }]
    },
    {
      "id": "registrar", "name": "Registrar", "botId": "$BOT", "instructions": "Registre o valor.",
      "parameters": [{ "name": "valor_registrado", "type": "number", "from": { "step": "receber", "output": "data.json", "field": "total" } }],
      "outputs": [{ "path": "registro.txt" }]
    }
  ]
}
JSON
curl -sS -X POST "$URL/api/workflows" -H 'content-type: application/json' --data @/tmp/opencode/wfw-save.json
```

Create the trigger. The map has one entry per start parameter and no entry for
`approved_by`:

```sh
cat > /tmp/opencode/wfw-trigger.json <<'JSON'
{
  "name": "Pedidos pagos",
  "workflowVersion": 1,
  "nodeId": "webhook",
  "eventTypes": ["order.paid"],
  "inputs": {
    "customer_id": { "source": "payload", "pointer": "/data/customer/id" },
    "amount": { "source": "payload", "pointer": "/data/amount" },
    "sent_at": { "source": "header", "name": "x-sent-at", "onMissing": "omit" }
  }
}
JSON
curl -sS -X POST "$URL/api/workflows/$ID/triggers" -H 'content-type: application/json' --data @/tmp/opencode/wfw-trigger.json
```

The `201` carries `trigger.endpointId`, `trigger.nodeId` and `credential.url`
once. Only `credential.url` is needed below; the secret is never readable
again. Confirm the stored file holds a hash only:

```sh
node -e 'const f=require(process.argv[1]);const t=f.triggers[0];console.log(t.endpointId, t.nodeId, /^[a-f0-9]{64}$/.test(t.secretHash), JSON.stringify(f).includes("wfsec_"))' "$DATA_DIR/workflow-triggers.json"
```

Expect the endpoint, `webhook`, `true`, `false`.

## 3. Refused configurations

Use the same `POST` with a modified `inputs`. Each answer is `400` with
`code: "workflowTriggerConfiguration"` and a `path`:

```sh
# extra key
node -e 'const b=require("/tmp/opencode/wfw-trigger.json");b.inputs.other=null;console.log(JSON.stringify(b))' | curl -sS -X POST "$URL/api/workflows/$ID/triggers" -H 'content-type: application/json' --data-binary @-
# missing required parameter
node -e 'const b=require("/tmp/opencode/wfw-trigger.json");delete b.inputs.amount;console.log(JSON.stringify(b))' | curl -sS -X POST "$URL/api/workflows/$ID/triggers" -H 'content-type: application/json' --data-binary @-
# a collected parameter
node -e 'const b=require("/tmp/opencode/wfw-trigger.json");b.inputs.approved_by=null;console.log(JSON.stringify(b))' | curl -sS -X POST "$URL/api/workflows/$ID/triggers" -H 'content-type: application/json' --data-binary @-
# a string constant where a number is declared
node -e 'const b=require("/tmp/opencode/wfw-trigger.json");b.inputs.amount={source:"constant",value:"12"};console.log(JSON.stringify(b))' | curl -sS -X POST "$URL/api/workflows/$ID/triggers" -H 'content-type: application/json' --data-binary @-
```

Each must name `inputs.amount`, `inputs.other` or `inputs.approved_by` in
`issues[].path`. A second create for `nodeId: "webhook"` answers `409`.

## 4. Preview

`TRIGGER` is `trigger.id` from the create answer.

```sh
curl -sS -X POST "$URL/api/workflows/$ID/triggers/$TRIGGER/preview" -H 'content-type: application/json' -d '{
  "payload": { "data": { "customer": { "id": "cus_42" }, "amount": 18.5 } },
  "headers": { "x-sent-at": "2026-11-17" },
  "query": {}
}'
```

Expect `resolvedInputs` with `customer_id: "cus_42"`, `amount: 18.5` and
`sent_at: "2026-11-17"`. A payload whose `amount` is `"18.5"` (text), or a
pointer that does not exist, answers `422` with issues; no run and no attempt
appears:

```sh
curl -sS "$URL/api/workflows/runs" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).runs.length))'
curl -sS "$URL/api/workflows/$ID/triggers/$TRIGGER/attempts" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).attempts.length))'
```

Both stay at their previous values.

## 5. Delivery and idempotency

```sh
HOOK=<credential.url from the create answer>
curl -sS -X POST "$HOOK" -H 'content-type: application/json' \
  -H 'Idempotency-Key: evt-1' -H 'x-github-event: order.paid' -H 'x-sent-at: 2026-11-17' \
  -d '{"data":{"customer":{"id":"cus_42"},"amount":18.5}}'
```

Expect `202 { "accepted": true, "runId": "…", "deliveryId": "evt-1", "duplicate": false }`.
Read the run and check the origin and values:

```sh
RUN=<runId>
curl -sS "$URL/api/workflows/runs/$RUN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).run;console.log(JSON.stringify({inputs:r.inputs,triggeredBy:r.triggeredBy,requestId:r.requestId},null,2))})'
```

`triggeredBy` is `{triggerId, triggerName: "Pedidos pagos", deliveryId: "evt-1"}`
and `requestId` starts with `wfw:`. Send the same request again: `202`,
`duplicate: true`, the same `runId`. `GET /api/workflows/runs` still has one run
for this delivery.

The crash seam is `OMB_WORKFLOW_TRIGGER_FAULT=after-start` in the child
process: the delivery answers `500` after the run exists and before its
receipt, and a retry (in the same process or after a restart) returns that same
run instead of starting another. The unit suite drives it through the manager's
`env` option, so no production launch sets it.

## 6. Refusals

- Missing `amount`: send a payload without `/data/amount` and `Idempotency-Key:
  evt-422`. Expect `422`, the body's `issues` naming `inputs.amount`, no new run,
  and one `rejected` attempt. The attempts answer carries only
  `deliveryId`, `eventName`, `statusCode` and `reason`; no payload and no header
  value.
- Wrong secret: replace the path secret. Expect `401` with the same body as an
  unknown `wfw_` endpoint.
- Pause the trigger with
  `PATCH /api/workflows/$ID/triggers/$TRIGGER` and `{"enabled":false}`; a new
  delivery answers `409` and creates no run. Re-enable it with `{"enabled":true}`.
- A body over 256 KiB answers `413` before parsing.

```sh
curl -sS "$URL/api/workflows/$ID/triggers/$TRIGGER/attempts?limit=50"
```

## 7. Delete, Undo and the Workflow

```sh
curl -sS -X DELETE "$URL/api/workflows/$ID/triggers/$TRIGGER"
# { "deleted": true, "undoUntil": … }; the old URL answers 401 immediately
curl -sS -X POST "$URL/api/workflows/$ID/triggers/$TRIGGER/restore"
# 200 with a new credential; the old URL stays 401, the new one delivers
curl -sS -X DELETE "$URL/api/workflows/$ID"
# 409 while a trigger exists
curl -sS -X DELETE "$URL/api/workflows/$ID?withTriggers=true"
# 200; the trigger moves to the trash, the Undo entry only restores while the Workflow exists
```

## 8. Studio

Open the Workflow in the Studio and click the webhook trigger node. **Configure**
is enabled after the first save. The inspector shows the pinned version, the
input rows, the enabled switch, Save and Preview; **Rotate secret** shows a new
URL once. The node chip reads **Configured** and shows `v3 → v5` when the
Workflow moved on. The trigger form never changes the definition: linkage is the
runtime `nodeId`, so a configured trigger does not bump the version.

## 9. Bot webhooks stay unchanged

Create a bot webhook through `/api/webhooks`, deliver to its `wh_` URL, and
confirm a `RoutineRun` still starts. An older app that only knows `wh_` answers
`401` to every `wfw_` URL without executing anything.
