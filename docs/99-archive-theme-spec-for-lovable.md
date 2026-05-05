# 99 — ARCHIVED: Theme spec for Lovable AI

> **Archived 2026-05-05.** The system has since moved off Lovable to the
> editorial Tailwind-v4 theme that ships in `frontend/src/styles.css`. This
> document is preserved for historical reference only — it doesn't reflect
> the current visual identity. To re-skin the app today, edit the `:root`
> CSS-variable block in `styles.css`; no theme handover doc is needed.

This is a self-contained handover doc. Paste it into Lovable (or any other
UI-design AI) when you want a polished theme. It describes **what** the app is,
**who** uses it, **which screens** exist, and the **constraints** the new
design must respect — so the result can drop straight into the codebase
without breaking any of the workflow logic that already works.

---

## 1. Product context

**Name:** Complaint Tracking System (CTS)
**Customer:** Hadi Clinic (private clinic; multi-department: Reception, Pharmacy, Lab, Nursing, …)
**Purpose:** Replace an Excel-based patient-complaint workflow with a multi-user,
auditable web app. Staff log complaints, route them to a department, investigate,
take action, and close them out — every change is tracked, attachments (photos / PDFs)
support the file, and managers see analytics across the operation.

**Tone:** Professional, clinical, trustworthy. Closer to a hospital EMR or a banking
back-office than a consumer SaaS. Calm. Not playful. **Not flashy.** Subtle motion,
restrained palette, generous white space.

**Audience density:** Front-desk and back-office staff working in the system for
hours. Optimise for **legibility**, **scannable lists**, and **a low-fatigue
palette**. Avoid gradients or animations that fight long-form reading.

**Out of scope:** Marketing pages, dark mode (welcome to add the variables but no
mode-switching UI yet), illustrated empty states.

---

## 2. Brand & identity

| | |
|---|---|
| **Brand name in the UI** | "Complaint Tracking" (subtitle) above a "CTS" wordmark |
| **Logo mark** | A simple shield glyph (currently a stroke-based SVG) — Lovable can refresh it |
| **Brand-mark colour** | Blue gradient (135°, primary → lighter primary). The mark sits on a soft white-blue glow on the login screen |
| **Accent colour family** | Blue. Stay in the same family across charts, links, focus rings, primary buttons |
| **Footer / hospital line** | "Hadi Clinic · Internal use only" |

---

## 3. Existing design tokens (do not rename, may revalue)

The codebase reads CSS custom properties from `frontend/src/styles.css`. **Renaming
breaks call-sites.** Lovable can change the *values* freely, add new variables,
and add classes — but the names below must continue to resolve.

```css
/* colour */
--bg, --bg-accent, --surface, --surface-2, --surface-hover
--border, --border-strong
--text, --text-muted, --text-subtle, --text-on-primary
--primary, --primary-hover, --primary-active, --primary-bg, --primary-border
--danger, --danger-hover, --danger-bg, --danger-border
--warn, --warn-bg, --warn-border
--success, --success-bg, --success-border
--sidebar, --sidebar-2, --sidebar-text, --sidebar-text-muted, --sidebar-accent

/* typography */
--font-sans, --font-mono
--text-xs, --text-sm, --text-base, --text-md, --text-lg, --text-xl, --text-2xl, --text-3xl

/* spacing */
--space-1 .. --space-10

/* shape */
--radius-sm, --radius, --radius-md, --radius-lg, --radius-full

/* elevation */
--shadow-sm, --shadow, --shadow-md, --shadow-lg

/* motion */
--transition-fast, --transition
--focus-ring
```

### Required component classes (must keep)

```
.card, .field, .badge, .badge-primary, .badge-warn, .badge-danger, .badge-success,
.row, .row-end, .col, .muted, .subtle, .danger, .right, .mono, .spacer, .hidden,
.toolbar, .backdrop, .modal, .modal-wide, .modal-header,
.toasts, .toast, .toast-info, .toast-success, .toast-error,
.dropzone, .dropzone.over, .err, .hint, .skeleton, .kbd
```

---

## 4. Information architecture / screens

The app has these screens. Lovable should design each one.

### 4.1 Login (`/login`)

- Single full-page screen, centred form
- Brand mark + "Complaint Tracking" + "Sign in to continue"
- Two inputs (username, password) + primary submit
- Error callout for invalid credentials / locked account
- Footer text: "Hadi Clinic · Internal use only"
- Subtle ambient glow / gradient on the page background — non-distracting

### 4.2 App shell (everywhere except `/login`)

- **Left sidebar** (240px, dark slate gradient):
  - Brand block (mark + wordmark) at top
  - Nav items with icon + label: **Dashboard**, **Complaints**, **Admin** (admin-only)
  - Active state: left accent bar, slightly different background, slightly different colour
  - User block at the bottom: avatar circle + display name + `@username · role`
- **Top header** (white, 1px bottom border):
  - Right-aligned: "Change password" button (ghost) + "Sign out" button (secondary), each with a small leading icon
- **Content area:** padded 24px, scrollable

### 4.3 Dashboard (`/dashboard`)

Two variants based on permission tier:

#### Manager dashboard (full picture)
1. **KPI strip** (4 cards in a row, clickable to filtered complaint list):
   - Total complaints
   - Currently open (emphasis: primary blue)
   - High / critical (emphasis: warn orange)
   - Avg time to close (last 90d) — number + caption "over X resolutions"
2. **Trend** card with 30/90/365-day toggle — area chart over time, zero-filled
3. Two-up panel: **By status** (donut + clickable legend) + **By priority** (bar)
4. Two-up panel: **By department** (horizontal bar) + **Open complaint aging** (vertical bar, 0–1d / 1–7d / 7–30d / 30d+)
5. **Resolution latency** card: 4 stat blocks (resolutions / avg / median / P95) + per-week dual-axis bar chart

#### User dashboard (scoped to their home department)
- Header shows the user's department as a badge ("Reception")
- Slimmer KPI strip (3 cards), trend chart, status pie + priority bar, aging
- No resolution latency or by-department panel

#### Empty states
- "No data yet" copy in muted text
- Trend chart shows a coaching message if no complaint dates set

### 4.4 Complaints list (`/complaints`)

- Header: title "Complaints" + "New complaint" primary button (icon: plus)
- **Filter toolbar** (one row, wraps on narrow):
  - Search-by-reference input with leading magnifying-glass icon
  - "Any status" / "Any priority" / "Any department" selects
  - "Date from" / "Date to" date pickers
  - "Clear" ghost button (only visible when any filter is active)
- **Table:** Reference, Status (badge), Priority (badge), Complaint date, Updated
  - Reference is a link to detail
  - Striped hover, rounded outer corners
- Pagination row: "Page X · N of M" + Previous / Next
- Empty state: muted "No complaints match these filters."
- Loading state: 5 skeleton rows in a card

### 4.5 New complaint (`/complaints/new`)

- Single-column form:
  - Complaint date (date picker, defaults to today, capped at today)
  - Dynamic fields rendered from the schema (text/number/date/dropdown)
  - Priority select
  - Department select (optional)
  - Assigned-to select (admin-only, optional)
  - Attachment queue (drag-drop, ≤3 files, image/PDF only, 2 MB cap each)
- Sticky-style "Cancel" / "Create complaint" footer

### 4.6 Complaint detail (`/complaints/:id`)

- Header: "← Back" + reference number + status badge + priority badge + Assign / Reopen buttons
- **Frozen banner** (yellow): shown when status ∈ {closed, resolved}; hides edit affordances
- **Two-column layout:**
  - **Left, 2fr:**
    - "Fields" card: dynamic field renderer; lock 🔒 indicator on locked fields; per-field validation errors; Discard / Save changes buttons
    - "Attachments" card: drag-drop zone (when editable); table of uploaded files; click filename → viewer modal
    - "Activity" card: timeline view (one-line sentences with relative time + actor name + colour-coded action dot; Details expander for raw payload)
  - **Right, 1fr:**
    - "State" card: status / priority / complaint date selects + department / assigned-to read-outs + created/updated timestamps
    - "Assignment history" card: small table of dept/user transitions with names

### 4.7 Attachment viewer modal

- Wide modal (max 760)
- Title: filename · size
- Body: image (`<img>`) or PDF (`<embed>`) inline
- Footer: Download + Close

### 4.8 Reopen dialog

- Modal with a status target select (Open / In progress) + optional note textarea
- Primary action is `danger` red

### 4.9 Assignment dialog

- Department select + (admin-only) assignee select + note textarea
- Save / Cancel

### 4.10 Admin (`/admin/*`)

Sub-pages, each rendered inside an `AdminShell` with a horizontal pill-tab nav at the top:

- **Users** (`/admin/users`): table + create/edit modal (with home-department picker), activate/deactivate, reset password
- **Roles & Permissions** (`/admin/roles`): split pane — role list on the left, role editor on the right with a permission grid. Permissions group by resource; checked state reflects the role's current grants
- **Departments** (`/admin/departments`): table + create/edit modal
- **Complaint fields** (`/admin/fields`): table of dynamic fields + create/edit modal + dropdown options editor
- **Settings** (`/admin/settings`): JSON editor per setting key
- **Audit** (`/admin/audit`): toolbar with filter inputs (complaintId, actorId, fieldKey, action select) + the same activity-timeline component used on the detail page

---

## 5. Component patterns

### Button variants
| Variant | Background | Text |
|---|---|---|
| `primary` | `--primary` | white |
| `secondary` | `--surface` | `--text` |
| `danger` | `--danger` | white |
| `ghost` | transparent | `--text` |

States: hover (slightly darker bg / `--surface-hover` for ghost), active (1px down translate), focus (`--focus-ring` shadow), disabled (opacity 0.5, no pointer).
Sizes: `sm` (5/10 padding, 13px font) and `md` (8/14, 14px). Optional leading icon.

### Badges
Pill shape (radius full), padding 2/10, 12px text, 500 weight. Variants: `primary`, `warn`, `danger`, `success`, default neutral.

### Cards
`--surface` background, 1px `--border` border, 10px radius, 20px padding, `--shadow-sm`.

### Forms
- Input padding 8/12, radius 8, 1px `--border-strong`, focus-ring on focus
- Disabled: `--surface-2` bg + muted text + not-allowed cursor
- Labels above input, 13px 500 weight
- Hint below in 12px muted; error in 12px danger

### Tables
- 1px outer border, rounded outer corners, separated borders
- Header: `--surface-2` bg, 12px UPPERCASE muted text
- Row hover: `--surface-hover`
- Cell padding 12/16

### Modals
- Backdrop: 55% slate-900 + 2px blur; fade-in
- Modal: 12px radius, 20px padding, `--shadow-lg`; slide-up enter
- Header: title + close (ghost ×)
- Footer: right-aligned button row

### Toasts
- Right-bottom stack
- Left coloured 4px border by kind (info=primary, success=success, error=danger)
- Slide-in from right
- 4-second auto-dismiss; click to dismiss now

### Charts (recharts is already in the codebase)
- Use existing color tokens for chart series:
  - Status: open=primary, in_progress=warn, resolved=success, closed=muted, rejected=danger
  - Priority: low=subtle gray, normal=primary, high=warn, critical=danger
  - Aging: green / amber / red / dark-red (high → severe)
- Cartesian grid `--border` dashed; tick text `--text-muted` 11px
- Tooltips: white surface, 1px border, small shadow

---

## 6. Hard constraints (these break things if changed)

1. **Class names + CSS variable names must continue to exist.** Values can change.
2. **Navigation routes must not change.** `/login`, `/dashboard`, `/complaints`, `/complaints/:id`, `/complaints/new`, `/admin/...`. URLs are bookmarked.
3. **The existing component primitives (`Button`, `Modal`, `Toast`, `Skeleton`, `Icons`) accept the same props.** New variants / sizes welcome; don't remove existing ones.
4. **All filter-in-URL behaviour must keep working.** `/complaints?status=open&priority=critical&dateFrom=2026-04-01` must render the filtered list.
5. **Permissions hide UI.** The sidebar's "Admin" link only renders when the user has any admin permission; same for buttons like "New complaint" (needs `complaint:create`), "Assign…" (`complaint:assign`), "Reopen…" (`complaint:reopen`), "Reset password" (`admin.users:manage`), etc. Don't surface controls the user can't use.
6. **Accessibility:** keep all `aria-label`s; ensure focus-visible outlines remain (we already use `--focus-ring`); honour `prefers-reduced-motion` (no required animations).

---

## 7. Density & spacing principles

- Default font size **14px**, line-height 1.5
- 4px-base spacing — every gap is a `--space-N` multiple
- Cards 20px padding inside, 12–16px between cards
- Tables: 12/16 cell padding
- Forms: 4–8px gap inside fields, 12–16px between fields
- Maximum text column width on long-form reads ~720px

---

## 8. Iconography

We currently ship hand-rolled stroke-based 24×24 SVGs (clipboard, dashboard, shield, search, plus, x, lock, user, log-out, key, check, eye, download, trash, alert, chevron-right). Replacing with **Lucide** or any other consistent stroke set is fine — keep the same names and the same stroke discipline (1.5–2px, currentColor).

---

## 9. Reference: existing `tracking/board.md`, `docs/01-architecture.md`, `docs/03-api-design.md`

If Lovable wants more detail on any screen's data shape, those three files have it.

---

## 10. What "done" looks like for the new theme

- Login page feels like signing in to clinical software (calm, premium, trustworthy)
- Sidebar reads like a hospital tool, not a SaaS marketing site
- Dashboard panels are scannable from across the room
- Complaint detail screens **don't intimidate** — long forms still feel manageable
- Tables are pleasant to read for hours
- Tone of motion: subtle, ≤200ms, no bounces, no shimmer-as-decoration
- A user opening the app for the first time understands the brand within 5 seconds

When in doubt: **less personality, more clarity.**
