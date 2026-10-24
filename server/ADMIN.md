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

## Credential file concurrency and recovery

Run Node.js 22 or newer. Every process that shares `API_KEYS_FILE` must run this
version and use the same regular file on a local filesystem with atomic exclusive
creation and same-directory rename semantics. Directory aliases are canonicalized;
file symlinks and hard links are rejected. Shared network storage and multiple
hosts require a transactional database instead; their locking behavior is not
established by these tests. Production topology has not been inspected.

Generation, revocation, validation/usage updates, and listing acquire an exclusive
`<API_KEYS_FILE>.lock` before reading. Writers flush a private temporary file and
atomically replace the JSON document before releasing the lock. A validation that
finishes before a concurrent revocation may authorize that request; validation
after a completed revocation is denied. In-flight requests are not cancelled.

Keep the containing directory private and writable by the server account; atomic
replacement needs directory write permission. New files request mode `0600` on
POSIX systems; restrict the directory ACL on Windows. Back up the credential store
securely. Never edit the store or remove a lock while any writer may be running.
Stop **all** old server processes before upgrading; older writers ignore this lock.

Lock waits are synchronous and bounded to five seconds. An unreadable/corrupt file,
failed write, or unavailable lock returns HTTP 503 for affected authentication and
management requests, without exposing credentials or filesystem paths. Existing
data is not replaced with an empty object. The server never steals an old lock:
a paused writer must not be mistaken for a dead writer.

After a crash, an orphaned lock deliberately keeps access disabled. To recover:

1. Stop and confirm termination of every process that can access this store.
2. Back up and inspect the main JSON file privately; restore a verified backup if
   it is corrupt. A crash before atomic replacement preserves the prior document.
3. Remove the orphaned `.lock` and abandoned sibling `.tmp` files only after all
   writers are stopped, then restart the updated processes.
4. Verify issued-key authentication and revocation using a disposable credential.

The tests cover competing processes, usage counts, read/commit failures, and a
killed writer. They do not establish power-loss durability or deployment safety.

## Dependency remediation

The October 24, 2026 audit initially reported eight vulnerable package entries
(six moderate, one high, one critical). The refreshed lockfile upgrades compatible
Express/Solana dependencies and removes the affected `stream-json` and old `uuid`
chain by pinning the transitive `jayson` dependency to 5.0.0 via `overrides`.
The Solana 1.x API is retained. Jayson 5 requires Node.js 20 or later; this server
supports Node.js 22+ and CI tests Node.js 22. Loopback RPC contract coverage exercises
all five Solana RPC methods used by X1, including transaction decoding and errors.
No live-chain calls, payments, deployment, or secret provisioning are part of this
validation. CI runs `npm audit --audit-level=moderate` without advisory suppressions.
