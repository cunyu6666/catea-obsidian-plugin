# Production Readiness

This checklist records the remaining work before Catea Pro billing is enabled in
the public plugin. It is intentionally separate from the release checklist: a
green build is necessary, but it does not establish that payment, entitlement,
and hosted-model operations are safe to expose.

## Current Gate

- The plugin billing UI is disabled by default through `BILLING_UI_ENABLED`.
- Internal billing diagnostics are disabled by default through
  `BILLING_DIAGNOSTICS_ENABLED`.
- The public API and hosted-model paths use `https://api.pencil.chat/billing`.
- On 2026-10-04, the authoritative DNS record and the Cloudflare, Google, AliDNS,
  and 114 public resolvers all returned the Render CNAME chain. The health route
  reached Render successfully. A prior regional response returned an Alibaba
  `Tengine` HTML page, so DNS stability remains an open production gate.
- On 2026-10-04, live checkout probes for the USD monthly subscription, CNY
  30-day pass, and CNY credit pack all returned the production
  `pancake.waffo.ai` checkout host rather than a sandbox host.
- Known credential-pattern scans over the complete Git histories of the plugin,
  API, and Web repositories found no committed MiniMax key, Creem key, Waffo
  private-key blob, or tracked private environment file. GitHub server-side
  secret scanning is not currently enabled for these repositories.

Billing must remain hidden until every P0 item below is complete and verified in
an installed Obsidian build.

## P0 — Required Before Enabling Billing

- Replace email-only entitlement lookup. A user who knows a subscriber's email
  must not be able to retrieve the subscriber's Catea license. Bind entitlement
  recovery to a high-entropy installation claim, one-time activation code, or a
  verified account flow, and migrate existing subscribers safely.
- Stop returning full license values from email status responses and admin user
  listings. Store and compare only what each flow needs, and show masked values
  to operators.
- Remove subscriber email addresses from URL query strings so access logs do not
  retain billing identity data. Use an authenticated request body or header.
- Disable `SINGLE_USER_MODE` in production, configure an explicit CORS allowlist,
  verify administrator authentication, and disable or protect `/docs` and
  `/redoc`.
- Resolve and monitor the intermittent `api.pencil.chat` regional DNS failure.
  Confirm the custom domain returns Render JSON/SSE from target user networks,
  not an Alibaba `Tengine` HTML page. Consider a proxied DNS/CDN route only after
  validating streaming and request timeout behavior.
- Verify the Render environment as one production set: Waffo provider and
  production environment, merchant and store, every subscription/pass/credit
  product, webhook verification, branded success URL, hosted-model provider,
  persistent database, and production secrets.
- Define refund, dispute, cancellation, and chargeback behavior. Waffo refund and
  dispute events currently record the event but do not revoke Pro access or
  reverse unused credits.
- Run a real low-value production matrix: USD subscription and renewal state,
  CNY WeChat 30-day pass, every credit pack, cancellation, expiry, refund,
  duplicate webhook delivery, delayed webhook delivery, and failed payment.
- Re-run repository history and release-bundle credential scans immediately
  before the release. Enable GitHub secret scanning when repository settings and
  plan support it.

## P1 — Operational Hardening

- Replace the single-process in-memory IP limiter with shared limits keyed by
  Catea license and IP, including checkout and entitlement endpoints.
- Add health, latency, hosted-provider failure, webhook failure, quota, and
  MiniMax balance alerts. Preserve request IDs without logging credentials or
  prompt content.
- Document and test InsForge database backup and restore. Introduce versioned
  schema migrations instead of relying only on startup `create_all()` behavior.
- Decide whether bounded overage from concurrent hosted requests is acceptable;
  otherwise reserve quota before starting provider requests and reconcile it
  from final usage.
- Load-test realistic Obsidian agent prompts against the 20,000-credit five-hour
  window and make the short-window behavior explicit next to monthly and top-up
  credits.
- Verify that the published support email is controlled, monitored, and covered
  by a response and refund procedure.
- Review the Render free-tier cold-start and single-instance risk before opening
  billing broadly.

## Release Gate

After the P0 work is complete:

1. Enable the billing UI only on a reviewed branch.
2. Run tests, type checking, lint, formatting, build, and the release-asset size
   gate.
3. Install the development build in Obsidian and repeat entitlement, payment,
   hosted-model, expiry, and failure-path tests.
4. Open a pull request and merge only after review; do not merge the deployment
   branch directly.
5. Bump the single version source and publish the GitHub Release assets only from
   the reviewed `main` commit.
