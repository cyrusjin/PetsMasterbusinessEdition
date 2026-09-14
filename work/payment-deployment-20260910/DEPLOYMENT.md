Payment deployment 2026-09-10

This directory records the exact eight source files deployed after merging with the live server. No credentials or environment files are included.

Production: /opt/petmaster/server
Rollback backup: /opt/petmaster/backups/payment-module-20260910-174506

Preserved production membership capacity checks, subscription payment client and API routes. Partner payment uses its own partnerPayClient.js. Existing offline orders retain the original update path. No store was switched to online payment.

Verification: syntax/module checks passed; existing local payment tests passed; live WeChat bank-list GET succeeded with response signature verification; health HTTP 200; unsigned callback rejected; unauthenticated order request HTTP 401; payment indexes created. Collection settings reports configured=true.

Pending: first submerchant application/signing and JSAPI product authorization, then real customer-confirmed payment, signed callback and refund test. No real payment or refund has been performed. Full sensitive-document API onboarding is still not implemented; current application submits platform initial-review materials.

Do not overwrite production using the entire work/petmaster-live/server tree: it contains unrelated membership changes not included in this deployment.
