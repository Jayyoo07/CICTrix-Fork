# modal

The standard ABYAN modal (DESIGN_IDENTITY §9.10). Its anatomy comes from the RSP *Create New Job Position* modal:

- a gradient header with a white title, an optional subtitle and a close button
- a white body that scrolls inside the panel
- a footer holding the actions

Plan: `docs/plans/2026-10-25-standard-modal.md`.

## Public interface

```tsx
import { Modal, ConfirmModal } from '../components/modal';

<Modal
  open={open}
  onClose={close}
  title="Create New Job Position"
  subtitle="Fill in the details to create a new job posting"
  size="md"                 // sm 480 · md 640 (default) · lg 880
  footer={<>
    <button className="btn btn-secondary btn-md" onClick={close}>Cancel</button>
    <Button loading={saving}>Create Position</Button>
  </>}
>
  …form…
</Modal>

<ConfirmModal
  open={open}
  title="Permanently delete this post?"
  message="This can't be undone."
  confirmLabel="Permanently Delete"
  tone="destructive"
  loading={busy}
  onConfirm={…}
  onCancel={…}
/>
```

**`Modal` props**

| Prop | What it does |
|---|---|
| `open`, `onClose` | Show the modal, and close it. |
| `title`, `subtitle`, `icon` | Header content. |
| `size` | `sm` 480, `md` 640 (the default), `lg` 880. |
| `footer` | The actions. |
| `dismissible` | `false` turns off Esc, overlay click and the close button. |
| `initialFocusRef` | The element to focus when the modal opens. |
| `bodyRef` | A ref to the scrolling body. |

**`ConfirmModal`** is the 480px confirmation. It takes `message`, `children` (for example a reason field), `confirmLabel`, `tone` (`primary` | `destructive`), `loading` and `confirmDisabled`. Focus starts on Cancel unless `children` holds a field.

**Behaviour:**

- It renders in a portal under `body`, inside an `.abyan-ds` scope, so tokens, `.btn` classes and the white header text hold in every portal.
- Focus goes to the first field, or to the close button, and Tab stays inside the modal.
- Esc closes only the top modal when modals are stacked.
- Page scroll is locked while a modal is open.
- Focus returns to the element that opened the modal.
- Below 640px it is a full-screen sheet.

## What it does NOT handle

- **Browser Back.** Callers that need Back to close the modal use `useBackClosesView` (§8.2) themselves, because the modal can't assume a router.
- **Unsaved-changes prompts.** The caller decides what `onClose` does.
- **Side drawers, toasts and full-screen viewers.** These are not modals.

## Dependencies

- `react-dom` (`createPortal`) and `lucide-react` (`X`)
- `src/styles/abyan-tokens.css`: `--gradient-modal-header`, `--overlay`, `--shadow-3`, `--neutral-*`, and the `.btn` classes
