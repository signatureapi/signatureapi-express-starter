# AGENTS.md

This repo is the SignatureAPI Express starter: an Express 5 + TypeScript app
that sends one agreement for e-signature and tracks it by webhook. It is a
template. Keep it small and idiomatic.

## Run and test

- Node 24 runs the TypeScript directly (type stripping). No build step.
- `npm install`, then `npm start` (port 3000, override with `PORT`).
- `npm run dev` restarts on file changes.
- `npm test` runs the unit tests (`node:test` + supertest, HTTP mocked).
- `npm run typecheck` runs `tsc`.
- `e2e/` is a real test-mode Playwright run. It needs a key and
  `npx --yes signatureapi listen`, so it is not part of CI. See `e2e/README.md`.

## Where things live

- `src/signatureapi.ts`: the SignatureAPI client (`uploadDocument`,
  `createEnvelope`, `listDeliverables`). All API calls go here.
- `src/webhooks.ts`: the webhook handler and the event → status map.
- `src/app.ts`: routes. `src/db.ts`: the `Agreement` model (SQLite via
  `node:sqlite`, schema created on startup). `src/views.ts`: the page.
- `test/app.test.ts`: unit tests.

## SignatureAPI rules

- The OpenAPI spec at https://spec.signatureapi.com/openapi.yaml is the
  source of truth for paths, fields, enums and event types. Check it before
  changing a request body or handler, not memory.
- Webhooks are verified with the `standardwebhooks` library against the
  **raw body bytes**. The webhook route is mounted with `express.raw()`
  before any other body parser. Never parse the body first, and never write
  the HMAC by hand. A failed check returns 401 and does nothing else.
- Final statuses (`completed`, `rejected`, `failed`, `canceled`) never change.
- Use test keys only (`key_test_...`). Never put a key in code, logs or commits.
  Keys and the webhook secret live in `.env` (gitignored).

## Agent skills

The SignatureAPI skills are vendored in `.agents/skills/` (Codex, Cursor,
Copilot and others) and installed for Claude Code through the plugin pinned in
`.claude/settings.json`. `scripts/update-agent-skills.sh <sha>` bumps both.
