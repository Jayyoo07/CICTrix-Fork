# portal-header

The one top bar for every signed-in portal: RSP, L&D, PM, Super Admin, Interviewer, Department Head (office console) and Employee. Built to `DESIGN_IDENTITY.md` §8.2 and the Header Logout spec in §9.1.

- 64px solid `--color-primary` bar (56px under 640px), sticky, hidden in print.
- Single-line lockup: mark, **ABYAN**, then *Human Resource Information System* (hidden under 1024px). Clicking it goes to the portal home.
- Optional notifications bell, avatar (or Switch Account), name and role (hidden under 640px), divider, glass Logout (icon only under 640px, still 44×44).
- Logout always asks first with `ConfirmLogoutDialog`.

## Public interface

| Export | What it does |
|---|---|
| `<PortalHeader homeHref userName roleLabel notifications? accountSwitch? mockData? onLogout? nav? />` | Renders the bar. `onLogout` runs after confirmation; without it the admin sign-out runs (clear session, `supabase.auth.signOut`, replace to `/admin/login`). `nav` renders a second row inside the bar for module navigation. |
| `HeaderNotification` | `{ id, title, message?, createdAt, unread, tone? }`. |
| `NotificationBellProps` | `{ items, unreadCount, open, onToggle, onClose }`. The portal owns open and read state, because opening marks items read differently per portal. |
| `AccountSwitch` | `{ prompt, onConfirm }`. Turns the avatar into a Switch Account popover. |

```tsx
<PortalHeader
  homeHref="/office/dashboard"
  userName={name}
  roleLabel="Department Head"
  notifications={{ items, unreadCount, open, onToggle, onClose }}
  accountSwitch={{ prompt: 'Switch to your Employee Account?', onConfirm: () => navigate('/employee/dashboard') }}
  onLogout={handleLogout}
/>
```

## Not handled

- Loading notifications or marking them read. The portal does that and passes the result.
- Page titles and breadcrumbs. Those go in the hero or the page (§8.2).
- The side rail (`RailNav`).

## Dependencies

React, react-router (`useNavigate`), Lucide icons, `ConfirmLogoutDialog`, `src/lib/adminSession.ts`, `src/lib/supabase.ts`, and the tokens in `src/styles/abyan-tokens.css` (the root carries `.abyan-ds`). The Switch Account actions use the shared `.btn` classes.
