# OrderNest / Spokojne zamówienia

A local order-review prototype for a small merchant. It compares expected amounts with completed capture records, flags exceptions and prepares a draft checklist. Matching amounts **do not authorize fulfilment**. The application never creates orders, captures payments, refunds, transfers money, updates tracking or contacts customers.

## Current evidence

The standalone Polish/English demo works without a server using **explicit fictional fixtures**. The six-record example has one match, one waiting order and four review cases. Editing an amount invalidates the old result and checklist. Reports expire after ten minutes. JSON exports retain demo/sandbox provenance.

38 distinct automated checks passed: 9 core, 4 injected PayPal transport, 3 injected model/agent, 8 in-memory HTTP boundary/download, 7 actual bundled UI event-flow checks using a simulated DOM, 4 report-format/provenance checks, and 3 test-order setup checks. Relevant changed checks were rerun; unchanged checks were retained. These offline checks are separate from the actual Sandbox and browser evidence below.

On 13 October, narrowly approved local execution also verified **two actual HTTP/model cases** against the existing local Qwen service: the six-order fixture produced a five-item draft, and a missing snapshot remained unconfirmed. The model selected the three application tools in both cases. These remain fictional payment records, not a live PayPal integration. After the user opened Chrome manually, the actual page and AI result were observed. Editing 89.00 to 60.00 cleared the old result; another real AI run produced two matches, one waiting and three review cases. Desktop and a 390-pixel browser viewport were inspected; the latter had no horizontal overflow. Download completion and actual mobile hardware remain unverified. No credentials were obtained, account created, cloud credit used or publication performed.

Version 0.3 adds readable Polish/English text reports and direct local HTTP download links. Actual HTTP responses and saved report contents were verified, including a report produced by a real local model run. The English browser model/checklist/download-link flow was observed. Automated Chrome download events and fresh screenshots timed out, so normal file-save completion remains a human check. A refund, currency mismatch or missing capture evidence displays an unconfirmed amount instead of a verified zero. Server download snapshots stay only in memory, are capped at 16 and expire within ten minutes; nothing is written automatically to a credential or order-data file.

## Open the demo

Open `../OrderNest-demo.html` from this workspace in Chrome or Edge. Select English if needed. The single file embeds the actual generated runtime and styles, so it does not rely on ES-module imports through a file URL. The optional AI button remains disabled in this mode.

## Run locally

Node.js 22.19 or newer is required. No npm packages are needed.

```text
node build.mjs
node server.mjs
```

Open `http://127.0.0.1:8802/`. Stop with Ctrl+C. On this Windows workspace, `Start-OrderNest.ps1` finds the existing bundled Node runtime, builds the preview and runs the server. It does not alter PowerShell policy or permissions. If scripts are blocked, use the two Node commands above.

For the current workspace, double-click `Uruchom-OrderNest.cmd` for the model-enabled demo. It uses the already installed runtime/model, keeps Sandbox credentials out of its child process and does not change script policy. The default `node server.mjs` command also works without a model.

## Optional existing local AI

```text
node start-local.mjs --with-ai
```

This option reuses a healthy server at `127.0.0.1:8790` or starts Qwen3-1.7B-Q8_0 / llama.cpp b11552 from this application's `.local-ai` directory. An existing sibling `calm-evening-mcp/.local-ai` directory is only a fallback for the original workspace. There is no automatic download during startup. The expected alias is `calm-evening-local`; startup never stops another service. A runtime started by OrderNest is stopped with OrderNest.

For a fresh Windows checkout, run `Setup-Local-AI.ps1` to download the pinned official runtime and model into this application's `.local-ai` folder. It checks SHA-256 before extraction and does not execute the model, change script policy or create an account. If local PowerShell policy blocks scripts, manually download and extract [llama.cpp b11552](https://github.com/ggml-org/llama.cpp/releases/tag/b11552) to `.local-ai/llama-b11552` and save [Qwen3-1.7B-Q8_0.gguf](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF) to `.local-ai/`; there is no need to weaken script policy. The model download is about 1.8 GB. Model: Apache-2.0; runtime: MIT; their licences are retained by the setup script.

On Linux/macOS, obtain the matching official llama.cpp runtime and Qwen GGUF, then run it in a separate terminal before starting OrderNest:

```text
llama-server -m /path/to/Qwen3-1.7B-Q8_0.gguf --host 127.0.0.1 --port 8790 --alias calm-evening-local -c 4096 -t 4 -tb 4 --jinja --no-webui --log-disable --offline
```

This manual path uses the same local HTTP/model protocol; hardware performance and non-Windows runtime installation have not been tested here. `node server.mjs` works with an already running healthy model and leaves that model process alone.

The model chooses from a bounded set of read-only tools: `reconcile_orders`, `explain_exceptions`, `draft_checklist`, `finish`. The model receives the goal, allowed actions and verified aggregate counts only. All money calculations, exception reasons and draft items come from application tools. Unknown actions and malformed/truncated replies are rejected; the application accepts no invented prose as payment evidence.

## PayPal Sandbox adapter — one actual waiting order verified

On 13 October 2026 the user entered Sandbox credentials privately and ran the opt-in setup helper. One unpaid 1.00 PLN order was created in actual PayPal Sandbox. The existing server read it as waiting with zero completed captures; the real local model prepared a checklist. The same actual read/model workflow was independently verified through Chrome and its PL/EN/JSON HTTP report contents were saved. This verifies one unpaid order, not completed, mismatched or refunded Sandbox payments; those additional scenarios are still fixture-only.

### First unpaid Sandbox order (optional test setup)

With OrderNest already running with Sandbox credentials, double-click `Przygotuj-Zamowienie-Sandbox.cmd` in Windows Explorer. It privately prompts for the same Sandbox credentials, exchanges them only with the fixed PayPal Sandbox origin and creates **one unpaid order for 1.00 PLN** using the documented minimal Orders v2 request. The helper never supplies a payment source, opens an approval link, authorizes/captures a payment or contacts a Live endpoint. This opt-in setup helper is separate from the read-only application.

It retains only the request ID, test order ID and safe test evidence in `OrderNest-Sandbox-test-setup.json`, `OrderNest-Sandbox-records.json` and `OrderNest-Sandbox-live-verification.json` beside the application folder. Credentials/tokens/customer data are not written to disk. After creation, it uses the existing local server to read the actual order and optionally run the existing local AI. Success requires a Sandbox-sourced waiting order with zero completed captures. Rerunning reuses an already saved order; an unknown creation outcome stops instead of automatically creating another one. Failure evidence is not presented as a successful integration.

The helper has three injected/offline checks and was then executed by the user with actual Sandbox credentials. Official references: [Orders v2 schema](https://developer.paypal.com/api/orders/v2/schema.json), [OAuth](https://developer.paypal.com/api/rest/authentication/), [request ID](https://developer.paypal.com/api/rest/requests/).

Configure `PAYPAL_SANDBOX_CLIENT_ID` and `PAYPAL_SANDBOX_CLIENT_SECRET` privately in the server's process environment before starting it. Never put credentials into this page, a public repository, an exported report or a video. No credential values belong in this source package.

The adapter uses the fixed Sandbox origin `https://api-m.sandbox.paypal.com`: OAuth client credentials followed solely by GET `/v2/checkout/orders/{id}`. No live-money endpoint is present. Tokens remain in process memory. Provider errors are sanitized; provider links, customer names, email and addresses are dropped. A read failure clears the result and never falls back to fixtures.

Use the own-orders disclosure to start an empty list and enter item name, PayPal Sandbox ID, expected amount and currency in the ordinary form. Comma decimals are supported. Up to 20 records are accepted. Advanced JSON import is also available. Example shape:

```json
[{"id":"SHOP-1","label":"Example item","paypalOrderId":"YOUR_SANDBOX_ORDER_ID","expectedAmount":"49.90","currency":"PLN"}]
```

Replace the illustrative identifier with your actual Sandbox order ID. Supported currencies are PLN, EUR and USD; all use exact two-decimal minor units. The application does not convert currencies or calculate refund net amounts. Explicitly select Sandbox and click Review. Fixture IDs beginning `DEMOORDER` are rejected in Sandbox mode. Sandbox results still represent **test money**, never real sales.

Windows users can run `Start-Sandbox.ps1` to enter both credentials in hidden local prompts. The script sets the server process environment and restores it when the app stops; it does not write a credential file or change execution policy. `-WithAI` additionally uses the existing local model. The launcher has been syntax-checked only: no real credentials were entered and no actual provider authentication was performed. Close any existing OrderNest process before restarting with credentials.

In this workspace, double-clicking `Uruchom-Sandbox.cmd` starts the alternative Node-based hidden prompt and existing local AI. It avoids depending on PowerShell script policy and does not change that policy. After entry, open the same local page and select Sandbox explicitly. The user used this entry path privately on 13 October; actual provider authentication and the waiting-order workflow then succeeded. The separate PowerShell launcher remains syntax-checked only.

## Validation before any contest submission

1. With private Sandbox credentials, read actual test orders for completed, approved/uncaptured, mismatched and refunded cases. Retain redacted evidence of source and comparison; do not claim fixture tests prove an integration.
2. Run the real local model and browser workflow. Confirm stale edits/cancellation, checklist and download; inspect the mobile layout and keyboard access.
3. Confirm the current contest rules and demonstrate the real provider/model behaviour in an English video under three minutes. This package has not been registered, published or submitted.

Official references: [PayPal contest rules](https://paypalaihackathon.devpost.com/rules), [resources](https://paypalaihackathon.devpost.com/resources), [REST requests](https://developer.paypal.com/api/rest/requests/), [Orders GET](https://developer.paypal.com/api/orders/v2/orders-get).

## Build and tests

```text
node build.mjs
node --test *.test.mjs
```

`build.mjs` syntax-checks the generated classic bundle and creates the standalone preview. The distribution only serves an explicit asset allowlist. The server binds loopback, validates Host/Origin/JSON, bounds input and provider response sizes and rejects unsupported routes. It is a local prototype, not a deployed production shop integration.
