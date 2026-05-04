# Board (current state)

Updated: 2026-05-04

| To Do | In Progress | Review | Done |
|---|---|---|---|
| T-130 `INotificationTransport` stub (post-1.0) | — | — | T-001..T-013 (auth + RBAC) |
| (Phase 2 / future scope) |  |  | T-031..T-035 (dynamic fields + UI) |
|  |  |  | T-041..T-045 (complaints CRUD + UI) |
|  |  |  | T-050..T-052 (locking + UI) |
|  |  |  | T-061..T-063 (assignment + UI) |
|  |  |  | T-071..T-074 (attachments + UI) |
|  |  |  | T-081..T-084 (audit + UI) |
|  |  |  | T-090..T-092 (dashboard + UI) |
|  |  |  | T-100..T-106 (admin UI) |
|  |  |  | T-110..T-114 (deployment + ops) |
|  |  |  | T-120..T-125 (testing + load + OWASP) |
|  |  |  | T-016/T-030/T-040/T-060/T-070/T-080 (schemas + seed) |

## Recently moved

- 2026-05-04 — T-001/T-010/T-016/T-030/T-040/T-060/T-070/T-080/T-110 → **Done** (foundation pass).
- 2026-05-04 — T-002..T-013 → **Done** (Sprint 1 — auth + RBAC).
- 2026-05-04 — T-031..T-033/T-041..T-044/T-050/T-051/T-061/T-081/T-083 → **Done** (Sprint 2 — dynamic fields + complaints lifecycle).
- 2026-05-04 — T-062/T-071..T-073/T-082 → **Done** (Sprint 3 — attachments + audit hardening + history).
- 2026-05-04 — T-034/T-035/T-045/T-052/T-063/T-074/T-084/T-092/T-100..T-106 → **Done** (Sprint 4 — frontend).
- 2026-05-04 — T-111..T-114/T-120..T-125 → **Done** (Sprint 5 — ops + testing + OWASP review).

## Definition of Done

A task is **Done** only when:

1. Code merged to `main`, build green.
2. Unit and (where applicable) integration tests added.
3. Migration (if any) applies on a fresh DB.
4. API change reflected in `docs/03-api-design.md`.
5. Audit/RBAC/locking impacts verified by reviewer.

## Sprint focus

- **Sprint 1:** ✅ Auth + RBAC.
- **Sprint 2:** ✅ Dynamic fields CRUD + complaints lifecycle.
- **Sprint 3:** ✅ Attachments + audit hardening + history endpoints.
- **Sprint 4:** ✅ Frontend (workflows + admin).
- **Sprint 5:** ✅ Testing + ops (deploy hardening, integration + e2e + load + OWASP review).

**1.0 scope is complete.** Remaining backlog (T-130 notification transport,
LDAP provider, S3 attachment store, log shipping, container digest pinning)
is post-1.0 and tracked in `docs/07-roadmap.md`.
