# Board (current state)

Updated: 2026-05-04

| To Do | In Progress | Review | Done |
|---|---|---|---|
| T-130 `INotificationTransport` real impl (post-1.0) | — | — | T-001..T-125 (1.0) |
| Future: LDAP provider |  |  | T-200..T-250 (E15 — UX feedback) |
| Future: S3 attachment store |  |  |  |
| Future: log shipping / metrics |  |  |  |
| Future: container digest pinning |  |  |  |
| Future: dark-mode (tokens already in place) |  |  |  |

## Recently moved

- 2026-05-04 — T-001/T-010/T-016/T-030/T-040/T-060/T-070/T-080/T-110 → **Done** (foundation pass).
- 2026-05-04 — T-002..T-013 → **Done** (Sprint 1 — auth + RBAC).
- 2026-05-04 — T-031..T-033/T-041..T-044/T-050/T-051/T-061/T-081/T-083 → **Done** (Sprint 2 — dynamic fields + complaints lifecycle).
- 2026-05-04 — T-062/T-071..T-073/T-082 → **Done** (Sprint 3 — attachments + audit hardening + history).
- 2026-05-04 — T-034/T-035/T-045/T-052/T-063/T-074/T-084/T-092/T-100..T-106 → **Done** (Sprint 4 — frontend).
- 2026-05-04 — T-111..T-114/T-120..T-125 → **Done** (Sprint 5 — ops + testing + OWASP review).
- 2026-05-04 — T-200..T-202 → **Done** (E15 Batch A — display names + friendly activity + create-time routing).
- 2026-05-04 — T-210..T-214 → **Done** (E15 Batch B — `complaint_date` as a first-class field).
- 2026-05-04 — T-220..T-223 → **Done** (E15 Batch C — closed/resolved freeze + `complaint:reopen`).
- 2026-05-04 — T-230..T-232 → **Done** (E15 Batch D — image+PDF policy, attach-on-create, viewer modal).
- 2026-05-04 — T-240..T-241 → **Done** (E15 Batch E — recharts + manager analytics).
- 2026-05-04 — T-250 → **Done** (E15 Batch F — visual theme refresh).

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
- **Sprint 5:** ✅ Testing + ops.
- **E15 (UX feedback):** ✅ All six batches A–F done.
- **E16 (round-2 UX feedback):** ✅ Roles-editor pre-populate fix, attachment-delete split, dashboard click-throughs, user/department dashboard scope, theme handover doc.

**1.0 + two rounds of UX iteration complete.** Remaining items
(T-130 notifications, LDAP, S3, log shipping, container pinning,
dark-mode) are explicitly post-1.0 and tracked in `docs/07-roadmap.md`.
Next direction is the user's call.
