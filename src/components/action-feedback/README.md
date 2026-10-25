# action-feedback

One way to tell the user an action is running, finished, or failed. Built to
`DESIGN_IDENTITY.md` §9.1 (button loading), §9.9 (alerts and toasts) and §13
(accessibility).

- **Pending** lives on the control: the shared `Button`'s `loading` prop, or
  `useAsyncAction().pending`.
- **Success** is a toast: what changed, in one line, gone after 5s.
- **Failure** names the action, says whether it completed, and gives a next step.
  Forms show it inline (`ActionFeedback`); row and list actions use a toast.

## Public interface

| Export | What it does |
|---|---|
| `<FeedbackProvider>` | Mount once at the app root. Holds the toast queue. |
| `useFeedback()` | `success/info/warning/error(title, message?, { action?, durationMs? })` and `notify(input)`. Safe without the provider: no-op. |
| `<ActionFeedback tone title message nextStep onRetry onDismiss />` | §9.9 inline alert for a form, dialog or drawer. Focuses itself on mount for errors. |
| `useAsyncAction<T>()` | `{ run, pending, failure, clearFailure }` for one mutation. Blocks re-entry, clears `pending` on throw, translates the error, fires the success toast. |
| `describeActionFailure(action, error, { context })` | From `src/lib/friendlyErrors.ts`. Returns `{ title, message, nextStep }` and logs the raw error. |

```tsx
const save = useAsyncAction();
const { notify } = useFeedback();

<Button loading={save.pending} onClick={() => save.run({
  action: 'save the training',
  run: () => saveTraining(form),
  success: { title: 'Training saved', message: 'It now appears in the calendar.' },
  onSuccess: closeDrawer,
})}>
  Save training
</Button>

{save.failure && (
  <ActionFeedback
    {...save.failure}
    onRetry={() => save.run({ /* same options */ })}
    onDismiss={save.clearFailure}
  />
)}
```

For a row action with no inline slot, add `failureChannel: 'toast'` and do not
render `ActionFeedback`.

## Not handled

- The network call itself. The caller owns the service function.
- Confirmation dialogs. Use the existing `Dialog` before a destructive `run`.
- Page-level read failures. Use `ErrorBanner`, which uses the same copy helper.
- Persisted history or analytics. Notices live for the session only.

## Dependencies

React, Lucide icons, `src/lib/friendlyErrors.ts`, and the tokens in
`src/styles/abyan-tokens.css` (with §3.6 hex fallbacks for the toast, which
renders above the portal scopes).
