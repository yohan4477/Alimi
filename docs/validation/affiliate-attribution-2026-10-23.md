# Affiliate attribution capability, not live revenue validation

## Implemented

- `POST /api/affiliate-import`: disabled until all server configuration exists; signed normalized report ingestion, 8 KiB cap, exact field allowlist, five-minute signed timestamp window, constant-time HMAC comparison, no credentials or provider errors returned.
- Append-only PostgreSQL revision ledger, idempotent retries, conflicting same-revision rejection, latest-revision views and currency-separated source totals. Out-of-order delivery cannot undo a newer reversal. Partial refunds use a new total snapshot, not a negative delta.
- Service-only database grants, RLS enabled, invoker functions/views. Browser roles cannot read transactions or call ingestion. No customer, account, email, address or raw provider payload fields accepted.
- Existing outbound links carry `post-<id>`, `comment-<id>` or `chat-<id>` refs. A confirmed network report can link a transaction to that public content only if the network actually returns that exact ref. Null ref means unattributed. This is not user/device-level attribution or proof that any click produced an order.

## Configuration and missing integration

No production migration, environment change, provider registration, order, purchase, webhook delivery or commission reconciliation was performed. The existing admin metrics should continue to say transactions are unconnected until a real approved adapter and verified data exist.

This endpoint is an **internal normalized importer**, not the native webhook protocol of Awin, Rakuten or Coupang. Before enabling it, an authorized operator must:

1. Obtain the approved network report/API access and merchant/account scope. Confirm network terms and permitted report fields. Never treat a client click or purchase button as a confirmed order.
2. Implement and review a provider-specific adapter: authenticate/poll the official network, map actual transaction and status fields, preserve the returned clickref/u1/subId, map currencies into integer minor units, and assign durable monotonically increasing revisions per transaction. Fetch authoritative updated snapshots for refund/cancellation; do not invent a sequence from delivery order. Retries must reuse their existing revision.
3. Apply `20261023031824_affiliate_order_ledger.sql` to an authorized staging database, run SQL permission and reconciliation tests, then follow the approved production migration process.
4. Configure `SUPABASE_URL` (HTTPS project URL), `SUPABASE_SECRET_KEY` (server only), `AFFILIATE_IMPORT_SECRET` (at least 32 random characters), and `AFFILIATE_IMPORT_NETWORKS` (comma-separated approved `awin`, `rakuten`, `coupang` networks only). Provisioning a new persistent secret requires the applicable operator approval. Keep the importer secret separate from network credentials. Never use a public frontend environment variable.
5. Verify staging transport with actual normalized signed fixtures, then reconcile an authorized real network report including at least one cancellation/refund before enabling revenue reporting. Retain an operator audit of import batches and provider retrieval timestamps outside the public client. Do not import the synthetic test IDs into production.

## Signed contract

JSON fields, all required: `network`, `transaction_id`, `revision`, `status`, `currency`, `sale_minor`, `commission_minor`, `source_ref`, `occurred_at`. Extra fields are rejected. Status is `pending|approved|declined|reversed`. Supported currencies are KRW, USD, EUR, GBP, JPY, CAD, AUD; amounts are nonnegative integer minor units. An approved refund snapshot contains the remaining amounts; a fully reversed snapshot normally contains zero. Only approved latest snapshots count toward approved revenue; never sum pending/declined/reversed states into earned commission. Never sum different currencies.

The adapter imports `normalizeTransaction` from `server/affiliate-attribution.js`, then signs:

`HMAC-SHA256(secret, unix_seconds + '.' + JSON.stringify(normalizeTransaction(transaction)))`

Use the exact property order returned by that function, UTC ISO dates with milliseconds, UTF-8, and lowercase hex. The signature covers this canonical normalized JSON, **not** raw transport whitespace; this works with Vercel's parsed request bodies. Send `Content-Type: application/json`, `X-Affiliate-Timestamp` and `X-Affiliate-Signature`. Normalized content changes invalidate the signature. Transactions outside the request timestamp window are rejected; old report event dates remain valid. No CORS or browser credential flow is provided.

A 200 response contains only `accepted` or `duplicate`. Conflicting revision or currency changes return 409. Invalid/unsigned/disabled requests return 4xx; unconfigured/database failure returns 503, never a success. Retry an uncertain timeout with the same transaction revision, new request timestamp and signature; database idempotency prevents duplicate attribution.

## Verification run

- `node --test tests/affiliate-attribution.test.js`: 7 tests pass.
- PGlite 0.3.14 executes the actual PostgreSQL migration and `supabase/tests/affiliate_ledger.test.sql`: duplicate/conflict, out-of-order reversal, partial refund, currency mutation and denied browser roles all pass.
- The same disposable PostgreSQL harness executes private-draft migration/RLS assertions: owner CRUD, cross-account isolation, stale update, expiry and anonymous denial pass.
- Reproduce with `npm install --prefix /tmp/seoul-db-test --no-save @electric-sql/pglite@0.3.14`, then `PGLITE_MODULE=/tmp/seoul-db-test/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-launch-db.mjs`.
- This is local PostgreSQL-engine verification with synthetic auth role fixtures, not Supabase hosted advisors, production RLS validation or end-to-end network delivery.

References: https://supabase.com/docs/guides/api/securing-your-api and https://supabase.com/docs/guides/database/postgres/row-level-security. Supabase changelog checked 2026-10-23; the announced old TLS cipher removal does not change this modern Node HTTPS flow.
