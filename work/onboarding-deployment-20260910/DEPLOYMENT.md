# 自动开户部署 2026-09-10

This directory records the exact six backend source files and admin page deployed to production. No credentials, application records, or private documents are included.

Production server: `/opt/petmaster/server`; admin page: `/var/www/petmaster/admin/collections.html`.
Initial rollback backup: `/opt/petmaster/backups/auto-onboarding-20260910-181650`.
Retry-compatibility patch backup: `/opt/petmaster/backups/auto-onboarding-retry-20260910-181948`.
The original payment deployment snapshot remains in `../payment-deployment-20260910`.

## Behavior

- Merchant supplies complete individual-business onboarding data and separately authorizes sensitive-data processing.
- Backend stores encrypted documents privately, validates store ownership and bank information, queues a stable business code and submits the ordinary provider `/v3/applyment4sub/applyment/` API.
- A persistent worker submits and polls; retries query the existing business code first. Both signed `RESOURCE_NOT_EXISTS` and signed `PARAM_ERROR` with the exact `未能找到申请单` message are recognized as absence. Concurrent submissions use an atomic queue version and worker lease.
- Submitted applications show the WeChat applyment ID, review rejection reasons and trusted official sign URL. Rejected merchants can edit and resubmit with the same business code; cancelled applications use a new code.
- WeChat identity verification, account confirmation and signing remain the operator's responsibility. Online collection is enabled only when the merchant explicitly saves that setting after completion.
- Previous requested applications stay editable and require missing identity/bank details plus the new consent before submission. No existing request is fabricated or submitted without the missing details.

## Private data

`keys/collection-vault.key` is generated on the server with 32 random bytes and mode 0600; it is not the payment signing key. Keep it with protected server secrets and backups. Optional override: `COLLECTION_VAULT_KEY_PATH`.
AES-256-GCM with store/version or store/material identity as AAD protects stored documents and queued sensitive fields. Numbers are not returned by merchant/admin APIs. Queued number copies are removed after WeChat acceptance or definite rejection. Images live in `collection_materials`, with a 30-day TTL and no public URL. Upload consent and application agreement records are retained. Expired documents must be reuploaded.

## Validation

Local membership and order payment suites pass. Dedicated onboarding tests cover encryption/tamper detection, document ownership, ID/date/bank validation, concurrent submissions, timeout recovery, real WeChat not-found semantics, rejection/resubmission, and offline opt-in. WXML and WXSS passed the installed WeChat compilers.
Live bank queries returned 143 distinct personal-account bank categories. A synthetic image upload to WeChat succeeded with response signature verification. The query endpoint returned a signed absent-application error. Server health passed after deployment. Existing stores remain offline.

## Limits and next real test

No real application POST, merchant signing, customer payment or refund has been performed with the new onboarding flow: the existing legacy application lacks identity and bank details. Use the updated miniapp (recompile or update the experience version), fill required fields and upload original documents, authorize, and submit. Confirm the application ID appears, review/verify/sign with WeChat, then explicitly enable online collection.
Miniapp preview through the IDE was not completed: the CLI service port is disabled, and UI tool access was rejected by automatic approval due to quota exhaustion. No miniapp release was published.

Do not deploy the entire `work/petmaster-live/server` tree; it contains unrelated membership changes. The live startup file was taken from production and only the onboarding initializer/router were added. Existing subscription payments, order logic and merchant collection modes were preserved.
