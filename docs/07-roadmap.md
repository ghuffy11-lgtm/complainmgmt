# 07 — Roadmap

Five phases. Each phase has explicit exit criteria. Phases overlap where engineers can work in parallel.

## Phase 1 — Core backend (weeks 1–3)

**Goal:** end-to-end CRUD over complaints, with auth, RBAC, dynamic fields, locking, audit, attachments — exercised via API only.

Exit criteria:

- [ ] All migrations apply on a fresh DB.
- [ ] Auth: login, refresh, logout, change-password.
- [ ] Users + roles + permissions admin endpoints.
- [ ] Dynamic field schema CRUD.
- [ ] Complaint CRUD + per-field write authorization + locking + override.
- [ ] Attachments upload/download with size + count limits.
- [ ] Audit log captures every field change; query endpoint.
- [ ] Assignment + assignment history.
- [ ] OpenAPI spec served at `/api/docs`; >80% backend unit-test coverage.

## Phase 2 — Frontend UI (weeks 3–5)

**Goal:** the workflows staff use day-to-day.

Exit criteria:

- [ ] Login page + protected routing.
- [ ] Complaint list (filterable/sortable).
- [ ] Complaint detail + edit form **rendered from the dynamic field schema** (no hardcoded fields).
- [ ] Lock indicators + override flow.
- [ ] Attachment upload (drag-drop, preview, count/size client-side checks).
- [ ] Assignment dialog + assignment history view.
- [ ] Per-complaint audit timeline.
- [ ] Dashboard for supervisor/manager/admin.

## Phase 3 — Admin panel (weeks 5–7)

**Goal:** turn the deployment over to a non-engineer.

Exit criteria:

- [ ] Users CRUD + role assignment + password reset.
- [ ] Roles CRUD + permission grid editor.
- [ ] Departments CRUD.
- [ ] Dynamic fields CRUD + dropdown options editor.
- [ ] System settings page.
- [ ] Audit search.
- [ ] Permission grid auto-extends as new dynamic fields are added.

## Phase 4 — Docker deployment (week 7)

**Goal:** one-command production deploy.

Exit criteria:

- [ ] `docker compose up -d` brings the stack up against a fresh host.
- [ ] NGINX terminates TLS; HTTP→HTTPS redirect.
- [ ] Postgres data volume persists across `docker compose down/up`.
- [ ] Backup + restore script proven by drill.
- [ ] Health probes wired (`/api/health`, NGINX `stub_status`).
- [ ] First-admin bootstrap from env documented and verified.

## Phase 5 — Testing & optimization (week 8)

**Goal:** confidence in production.

Exit criteria:

- [ ] Backend integration tests against real Postgres in CI.
- [ ] Frontend e2e (Playwright) for critical paths: login, create complaint, assign, override.
- [ ] Load test: 100 concurrent users, p95 < 300 ms on read endpoints.
- [ ] OWASP top-10 manual review (auth, IDOR on complaint IDs, file upload validation, SQL injection sweep).
- [ ] Logging + metrics dashboards in place.

## Future (post-1.0)

| Item | Notes |
|---|---|
| Email notifications | `INotificationTransport` interface already in place; first transport is SMTP. |
| LDAP / AD auth | `IAuthProvider` already in place; second provider plugs in beside `LocalAuthProvider`. |
| External attachment storage | `IAttachmentStore`; first non-DB transport is S3-compatible. |
| Migration runner | Replace Postgres init-script flow with a node-based runner that records `schema_migrations`. |
| Multi-tenant | Schema-level tenancy (each tenant in its own Postgres schema). Significant work — kept out of phase 1. |
| Mobile app | Reuse the same API; native shell. Not on the near-term roadmap. |
