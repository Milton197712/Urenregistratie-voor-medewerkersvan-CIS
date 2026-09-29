---
name: Time registration policy
description: Durable business rules for the attendance app.
---

The workday policy is split into 07:30–12:00 and 13:00–16:30. The API should auto-close at the two cutoffs unless an approved overtime request covers the later cutoff, and automatic changes must remain distinguishable from manual corrections. A clock-in must carry a selected active project.

**Why:** The employee's core requirement is predictable time tracking with controlled exceptions and manager visibility.

**How to apply:** Keep these times and project association consistent across API logic, settings copy, forms, reports, and future authentication or payroll integrations.