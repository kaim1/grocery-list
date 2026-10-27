# Grocery list design language

Read and follow [`../DESIGN.md`](../DESIGN.md). The choices below reflect the
implemented product.

## Established direction

- Hebrew-first, RTL, mobile-first PWA; clean, airy and fast to scan in a store.
- Background `#F6F7F4`, white surface `#FFFFFF`, ink `#17211B`, muted
  `#6C7A70`, hairline `#E7EAE4`, field `#EFF2EC`.
- One primary blue accent: `#1A73E8`. Red is reserved for destructive actions.
- System typography, compact rows, rounded pills, 14–20px surfaces and very
  soft shadows.
- Product names and quantities lead; controls remain compact and touchable.
- No product images or decorative illustration. Motion is limited to swipe,
  sheet and toast transitions.

## Layout (redesign approved 2026-10-23)

- Things-style: no header bar. Each screen opens with a large title or with grey
  section labels, on the light grey background. Plain rows with thin outline ring
  checkboxes, no cards.
- Four bottom tabs, right to left: משימות, קניות, פרויקטים, הגדרות. The app opens on משימות.
- Each list screen has one floating white pill above the tab bar (add product,
  new task, new project). The catalog is not a tab: the shopping pill opens it as
  the add/search screen.
- Tasks are grouped by when: היום, מחר, השבוע (to Saturday), החודש, בהמשך (after this
  month) and מתישהו, which holds every undated task (בכל זמן and מתישהו alike).
  A row shows the project name and a bell when both exist, otherwise the time
  and bell; the bell sits on the left.
- The add-task composer is one chip row: תאריך, שעה, חוזר, פרויקט, then the
  round add button. Chips are grey until set and then show the value. A date,
  time or repeat typed in the title fills them, with a dismissable chip under
  the field; a manual pick wins. The date chip opens the "מתי?" sheet: היום,
  מחר, בכל זמן, מתישהו, then a month calendar (weeks start on Sunday).
- Repeating tasks show a small ↻ in the row meta. The repeat sheet offers the
  common rules plus a custom one (on a calendar, or N days after checking).
  Checking one adds the next at once with an undo toast; a series has one open
  task at a time.
- Swiping a row left to right reveals a small rounded red button on a soft pink
  strip; a long swipe deletes. Every delete shows an undo toast.
- Editing happens in bottom sheets with no cancel button; tap outside or drag
  down to close. The task editor saves every change as it happens and has no
  save pill; other edit sheets keep a save pill.
- The reminder picker offers four presets (בעוד שעה, הערב, מחר בבוקר, בשבוע הבא)
  and an exact date and time wheel in 5-minute steps. Notification permission is
  asked once per device, after an in-app explanation sheet.

## Desktop (approved 2026-10-25)

- From 760px wide the bottom tabs become a right sidebar: היום, מחר, השבוע, החודש,
  בהמשך, מתישהו (separate views, desktop opens on היום; השבוע has a section per day), then קניות, the active projects
  with open counts, and הגדרות at the bottom. The phone keeps one grouped משימות screen.
- Tasks in a project show only on that project's page. On the desktop the page has chips
  הכל plus the same views to narrow it.
- The list stays in a centred ~640px reading column. Clicking a task opens a
  details pane on the left (372px; it overlays the list under 1100px) with the
  title, notes, מתי, שעה, חוזר, פרויקט. Edits save as they happen; Esc closes.
- On the desktop sheets become small popovers next to the control that opened them.
  The composer opens in place without dimming and starts in the current view's "when".
- Right-click menu on a task; drag a task onto a sidebar view or project. Swipe stays touch-only.
- Shortcuts use physical keys so they work in the Hebrew layout: N, ↑↓, Enter, Space,
  T, M, D, Backspace, ⌘Z, 1–7, Esc, ? (list in the app).
- The shopping catalog opens as the left column; Enter adds the first match.
- Tasks have free-text notes (pane and phone edit sheet); a small page icon marks them in the row.

## Sources of truth

- Implemented tokens and components: `style.css`.
- Product design: `docs/superpowers/specs/2026-08-06-hebrew-grocery-pwa-design.md`.

Reuse existing rows, pills, sheets and controls. Do not introduce another
accent or a visually different screen without approval.

## Approved sign-in flow

- The existing sync dialog includes an email form followed by a pasted email-link
  field and a “התחברות וסנכרון” button. Reuse the existing fields and buttons.
- Explain that users copy the original email link without opening it and paste it
  into the app, so sign-in completes in the app they are currently using.
- Clear the pasted link on submission or dialog close; show authentication errors
  inside the dialog and retain the separate, accurate cloud-sync status.
