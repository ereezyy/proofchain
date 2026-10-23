# API key management authorization

The three global key-management routes require an independent operator secret:

- `GET /api/pro/keys`
- `POST /api/pro/keys/generate`
- `DELETE /api/pro/keys/revoke/:key`

Provision `PROOFCHAIN_ADMIN_KEY` in the API server's protected runtime environment
and restart the server. Generate at least 32 random bytes with a cryptographic
generator, encoded as hex or base64. Do not reuse a customer API key. Keep this
secret out of source control, customer key storage, browser code, URLs and logs.
Send it only in `X-Admin-Key` over HTTPS from a trusted administrative client.
No customer API key is needed for these operator-only routes.

Without a configured secret of at least 32 bytes, management returns HTTP 503.
A missing admin header returns 401; an incorrect value returns 403. Ordinary
free/Pro keys grant no key-management access. Existing customer API routes keep
their current `X-API-Key` authentication. There is no HTTP route to issue or
change the operator secret; customer-created keys cannot promote themselves.

Rotate the operator secret by replacing the environment value and restarting
all server processes. Previous customer keys are not migrated or promoted.
The admin credential remains globally privileged; limit who can read it.

Run `npm ci --ignore-scripts` then `npm test` from `server/`. HTTP tests bind
only to loopback, use synthetic keys in a temporary directory, and make no
external service calls. They exercise all three management routes plus normal
Pro authentication. These tests do not establish a complete security audit.

This change must be deployed to protect a running instance. Updating the PR
alone does not change production. Review existing issued keys and server logs
for unauthorized management activity; revoke suspicious customer keys through
the newly protected operator routes.
