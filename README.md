# OrderNest — A Calmer Order Review

A calm order-review workspace that reads **actual PayPal Sandbox order details**, compares expected amounts with capture evidence and uses a **local Qwen AI agent** to prepare a draft checklist. English and Polish interface; exact amounts; source-labelled text and JSON reports. The review application never creates, captures or refunds payments or authorizes fulfilment.

## What was demonstrated

On 13 October 2026, a separate opt-in helper created one unpaid Sandbox order for **1.00 PLN**. The application read the actual order and the local model produced a checklist. Chrome showed **one waiting order, zero completed captures**. Editing 1.00 to 2.00 cleared stale results; another actual provider/model run still showed an unpaid order. No real money was used.

The optional six-order illustrative shop is **fictional data**, including match, mismatch, currency and refund examples. Actual completed, mismatched or refunded Sandbox payments have not been verified. Offline checks do not substitute for actual provider evidence.

## Quick start — ordinary review

Install Node.js **22.19 or newer**, then from the repository root:

```text
cd ordernest
node build.mjs
node server.mjs
```

Open http://127.0.0.1:8802/ and select English. No npm packages are required. This ordinary mode uses labelled fictional fixtures. Stop the server with Ctrl+C.

The standalone `OrderNest-demo.html` is a fixture preview; AI and PayPal require the local server.

## Run the real PayPal + local AI workflow (Windows)

1. In `ordernest`, run `Setup-Local-AI.ps1` to obtain the official pinned Qwen3-1.7B Q8_0 model (about 1.8 GB) and llama.cpp b11552 runtime. SHA-256 is checked before extraction; nothing is installed or executed automatically. If scripts are blocked, use the documented manual download steps in [the detailed setup](ordernest/README.md#optional-existing-local-ai). Do not change script policy.
2. Obtain your own free [PayPal Developer Sandbox credentials](https://developer.paypal.com/dashboard/applications/sandbox). Remain in **Sandbox**, open an existing application or create one through PayPal's own setup, and keep its Client ID and Secret private. No credentials from this project's author are required or distributed.
3. Close the ordinary OrderNest server if running. Double-click `ordernest/Uruchom-Sandbox.cmd` in Windows Explorer. Privately enter your Sandbox Client ID and Secret. The local model and server start; credentials remain in process memory.
4. Keep that window open. Double-click `ordernest/Przygotuj-Zamowienie-Sandbox.cmd`. Enter the same private Sandbox credentials. This opt-in helper creates **one unpaid 1.00 PLN Sandbox order** and verifies the actual read and AI report through the existing server. It provides no payment source and never calls approve, authorize, capture or refund endpoints. A successful run prints the order ID and `GOTOWE`.
5. Open http://127.0.0.1:8802/. Select English. Expand **Import your order records**, then **Advanced import**; paste the contents of the generated `OrderNest-Sandbox-records.json` in the repository root and click **Load records**. Select **PayPal Sandbox — read only** and click **Prepare with local AI**. Expect one waiting order, zero completed captures and a draft checklist.
6. Change the expected amount: the old result and download links clear. Review again. Use **Download readable report** or JSON to retain the source-labelled snapshot. These are test-money records only.

The opt-in test-data helper is separate from the read-only review application. Re-running it reuses its saved order; an unknown creation outcome stops rather than silently creating duplicates. The setup/evidence JSON files contain only test identifiers and sanitized facts, not keys or tokens; they are excluded from Git.

Linux/macOS can use an independently started local llama.cpp server with the exact alias and flags in [the detailed setup](ordernest/README.md#optional-existing-local-ai), then configure their own Sandbox credentials in the server process environment. Those hardware/platform installation paths have not been tested here. Windows private launch and actual Sandbox/model/browser behaviour have been verified.

## How AI is used

Qwen3 runs locally through llama.cpp. It receives the goal, allowed tool names and **verified aggregate counts**, not customer details, order identifiers or individual prices. The model selects bounded read-only tools (`reconcile_orders`, `explain_exceptions`, `draft_checklist`, `finish`). Deterministic application tools perform exact minor-unit calculations and generate canonical reasons and the checklist. Unknown model actions are rejected. No external AI API or paid AI credit is used.

## Validation and limits

```text
cd ordernest
node --test *.test.mjs
```

**45 offline/injected checks passed** on October 15, plus the recorded October 13 actual local HTTP, model and Chrome validation. The actual Sandbox waiting-order case is separate evidence. Downloaded HTTP text/JSON contents were verified; automated Chrome file-save completion and physical mobile hardware were not verified.

Version 0.4 refreshes each current Payments v2 capture using a read-only GET before classifying the order. It checks capture identity, currency, gross amount and any related order ID; a read failure cannot fall back to an embedded completed status. Refund and partial-refund statuses require review. Four injected capture tests cover this change; completed/refunded provider transactions remain unverified. See [the detailed setup](ordernest/README.md#october-15-improvement-refresh-the-capture-not-just-the-order).

For actual acceptance checks, start the application with your private Sandbox credentials, then run `ordernest/Sprawdz-Scenariusze-Sandbox.cmd`. It reads supplied actual waiting/completed/refunded order IDs through the existing application, compares a completed 1.00 PLN capture against both 1.00 and 2.00 PLN shop records, and writes a redacted local report. Missing cases remain `not_run`. This tool never creates, approves, captures or refunds a payment and does not call AI. The existing English video documents the October 13 workflow, not this update.

Local prototype: no production merchant integration, background synchronization, exchange-rate conversion, refund net calculation or automatic fulfilment. Fixed Sandbox API origin only; no Live endpoint. The edited demo film uses authentic application captures with synthetic English narration and is labelled as an edited walkthrough, not continuous screen recording.

## Licence and sources

Application: [MIT](LICENSE). Model: [Qwen Apache-2.0](https://huggingface.co/Qwen/Qwen3-1.7B-GGUF). Runtime: [llama.cpp MIT, pinned b11552](https://github.com/ggml-org/llama.cpp/releases/tag/b11552). Model weights and runtime binaries are downloaded separately and are not bundled in this repository.

Official [Orders API](https://developer.paypal.com/api/orders/v2), [OAuth](https://developer.paypal.com/api/rest/authentication/) and [PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules). Built with AI coding assistance and participant feedback/testing.
