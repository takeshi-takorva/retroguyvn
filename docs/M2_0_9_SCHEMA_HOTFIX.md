# CMS M2.0.9 schema bootstrap hotfix

Cloudflare D1 returned `D1_EXEC_ERROR` while the M2 runtime schema bootstrap passed a multi-statement SQL string to `DB.exec()`, beginning with `PRAGMA foreign_keys = ON;`.

M2.0.9 adds a Worker-entry D1 compatibility wrapper. Only the M2 schema bootstrap SQL is intercepted; it removes the redundant `PRAGMA foreign_keys` statement and executes each remaining DDL statement individually with prepared statements. All other D1 methods are forwarded to the original binding.

Expected runtime progression after deployment:

1. `d1: true`
2. `r2: true`
3. `schemaReady: true`
4. legacy Homepage/media migration runs
5. `migration.completedAt` is populated and the system reports `m2-active`
