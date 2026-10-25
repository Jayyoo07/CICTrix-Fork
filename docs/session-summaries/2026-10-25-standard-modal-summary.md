# Standard modal — session summary

Plan: `docs/plans/2026-10-25-standard-modal.md` (In Progress, phase 1 of 5 done).

## Phase 1 — Foundation (2026-10-25)

**Shipped as planned**

- **New module `src/components/modal/`** (index.ts, README.md, `_internal/`):
  - `Modal`: gradient header with white title, subtitle and close; a white body that scrolls inside the panel; footer actions; sizes sm 480, md 640 and lg 880; a full-screen sheet below 640px.
  - `ConfirmModal`: 480px, with `tone="destructive"` and the §9.1 loading state.
  - `useModalBehavior`: focus in, Tab trap, Esc on the top modal only, scroll lock, and focus returned to the opener.
- **Token `--gradient-modal-header`** in `src/styles/abyan-tokens.css`.
- **DESIGN_IDENTITY.md:**
  - §3.5 gradient row
  - §9.10 rewritten as the standard anatomy
  - §9.7.1 list modal is now `size="lg"` with an inner-scrolling body
  - §14.1 token
  - §15 Do/Don't row
  - §16 checklist line
  - §17 item 13, the migration note
- **`src/components/Dialog.tsx`** now renders `Modal` with its old props, so its 30 call sites in 12 files use the new shell. The legacy `.dialog-*` CSS in `components.css` is removed.

**Deviations**

- **Optional title.** `Modal` takes an optional `title` (plus `ariaLabel`) so the 14 untitled legacy `Dialog` calls keep their own heading for now. Those calls are in App, PMCompetencyFramework, PMIPCRManagement, PMPromotionalApplications, PMDashboard, ApplicantWizard, EvaluationForm and InterviewerDashboard. They get the full header in their portal's phase. New code should always pass a title.
- **Browser Back.** It is not built into `Modal`, because it can't assume a router. Callers use `useBackClosesView`.
- **Visible change in the Dialog modals.** Buttons inside them now take the §9.1 pill style, because the modal renders in an `.abyan-ds` scope. Titled ones get the gradient header and widths become 480px (from 500px).

**Checks**

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 55 files, 502 tests. The new `Modal.test.tsx` adds 7 tests: labelled dialog, first-field focus, Esc with focus return, overlay dismiss, non-dismissible, Tab trap, scroll lock, and stacked ConfirmModal with loading.
- `npm run build`: succeeds.
- `impeccable detect` on the module: no findings.
- **Temporary harness** (removed), at 1366×768:
  - the header title computes to white, 20px/700
  - the subtitle computes to `#C8D1FF`
  - the overlay is `rgba(4,14,107,.45)`
  - the panel is 640px with a 16px radius
  - the body scrolls with the footer kept visible
  - the 480px confirmation stacks with focus on Cancel, and Esc closes only the top modal
- **Same harness at 375px:** a full-screen sheet with the footer pinned.
- **Not checked:** the real portal pages, since they need a live sign-in.
