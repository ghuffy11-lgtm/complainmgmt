# Epics

Top-level work streams. Each epic decomposes into Features (one heading deeper, in `tasks.md`).

## E1 — Authentication & Session Management
Local auth with bcrypt; JWT access + DB-backed rotating refresh tokens; pluggable provider for future LDAP. Lockout, password change, force-logout.

## E2 — Authorization (RBAC)
Dynamic roles + permissions with field-level granularity and override semantics. Permission catalog auto-extends as dynamic fields are added.

## E3 — User & Department Management
Admin CRUD over users, departments. Activation/deactivation. Role assignment.

## E4 — Dynamic Form System
Admin-defined complaint fields (text/number/date/dropdown/file) with validation, visibility, locking. Form rendered from schema; no client-side hardcoding.

## E5 — Complaint Lifecycle
Create / read / update / status / priority. Per-field write checks. Reference number generation.

## E6 — Field Locking & Override
First-writer-wins ownership for flagged fields with audited overrides.

## E7 — Assignment & History
Single department + optional user assignment, with full history.

## E8 — Attachments
Up to 3 files × 2 MB each, stored in DB via pluggable `IAttachmentStore`. MIME sniffing and allow-list.

## E9 — Audit Trail
Append-only log of every field change; queryable with filters; INSERT-only DB grants.

## E10 — Dashboard & Reporting
Aggregates: status, priority, department breakdowns; manager-level visibility.

## E11 — Admin Panel (UI)
Single panel surfacing E2/E3/E4 + system settings + audit search.

## E12 — Deployment & Operations
Docker Compose stack, NGINX TLS, backup/restore, healthchecks, hardening checklist.

## E13 — Testing & Hardening
Unit + integration + e2e + load + OWASP review. CI pipeline.

## E14 — Future-Ready Interfaces *(scaffold only in phase 1)*
`IAuthProvider`, `INotificationTransport`, `IAttachmentStore` defined and consumed; only the phase-1 implementations exist.
