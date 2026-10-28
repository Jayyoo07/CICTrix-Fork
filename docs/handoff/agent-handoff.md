# Agent Handoff: CICTrix HRIS rules and skills

Target: OpenCode v2 (written against v2.1.4, October 2026). This file is the long-form reference for how this repo is meant to be worked on. The operational copy that loads every session is `AGENTS.md` at the repo root; keep the two consistent when either changes.

"Skill" below means a reusable instruction block OpenCode advertises and loads on demand with the `skill` tool. "Command" means a slash command defined in `.opencode/commands/`, expanded into a prompt when you type it.

---

## 1. Project

CICTrix / ABYAN HRIS. React 18 + TypeScript + Vite front end, Supabase (Postgres, migrations in `supabase/migrations/`), deployed on Vercel. Tests on Vitest. Repo path: `C:\Users\ajcbu\Documents\GitHub\CICTrix-Project` (Windows; PowerShell primary, Git Bash available).

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npx tsc --noEmit` | Type-check |
| `npm run build` | Type-check and build |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm test` | Vitest |
| `npm run check:migrations` | Migration version drift check (CI runs it on PRs touching migrations) |

### Migrations
- Create with `npx supabase migration new <name>` (unique 14-digit version). Never hand-name a migration or reuse a date.
- Merge by PR. The Supabase GitHub integration applies it to production on merge to `main`.
- Do not run repo migrations by hand: no dashboard SQL Editor, no MCP `apply_migration` for files in `supabase/migrations`. Hand-applied SQL drifts the remote migration log and breaks the Supabase Preview check.

### Repo-specific memory (from prior sessions)
- Supabase MCP writes get auto-declined in the desktop app. The user runs SQL in the dashboard editor and confirms the warning dialog. Verify afterwards with read queries.
- Never push or open PRs against `Trsha11102004/CICTrix`. Push to `origin`; open PRs against `dehandenver` with an explicit `--repo`; PR branches go to `Jayyoo07/CICTrix-Fork`.
- Generated people use Faker `en_PH` Filipino names; spot-check them in the report.
- Other project-scoped notes exist under `~/.claude/projects/c--Users-ajcbu-Documents-GitHub-CICTrix/memory/` (IPCR rating scale, admin roles, employees schema drift, prefer `employees` base table, thorough analysis). OpenCode does not read that folder; copy anything still relevant into `AGENTS.md` or `CONTEXT.md` instead.

### MCP

The Supabase MCP server is configured globally in `~/.config/opencode/opencode.json`:

```jsonc
{
  "mcp": {
    "servers": {
      "supabase": {
        "type": "remote",
        "url": "https://mcp.supabase.com/mcp?project_ref=fyzdfgxaaowjzbjpwrii&features=..."
      }
    }
  }
}
```

- V2 puts servers under `mcp.servers`. A server named directly under `mcp` is silently ignored.
- Authentication is OAuth against a Supabase account, not an API key. Sign in with `/mcps` in the app, or `opencode mcp auth supabase` in an interactive terminal.
- Do not run `opencode mcp auth` through an agent's shell tool. It prints the authorization link to a stream that gets captured and hidden, leaving the flow waiting.
- The granted scopes include `database:write`, `storage:write`, and `secrets:read`. The token can modify the live project. The migration rule above still governs: MCP writes to repo migrations are forbidden.
- A publishable key (`sb_publishable_...`) is a client credential for the app, public by design and gated by RLS. It is not an MCP credential and does not sign anything in.

---

## 2. Hard rules (flag it if a request would break one)

1. **Confirm before external sends.** Pushing, deploying, posting to APIs, sending email, writing to the live Supabase database. An explicit instruction to do one in the current request counts as confirmation. Otherwise ask. Local edits are fine.
2. **No secrets in code or commits.** No hardcoded passwords, API keys, Supabase keys (especially `service_role`), or connection strings. Read from `.env`. Flag any you find.
3. **Verify, don't fabricate.** Run or check first. Show evidence before claiming something works.

---

## 3. How to work

- **Plan first.** Multi-step tasks: write the plan, wait for approval, then edit.
- **Ask which model before delegating.** Before the first `subagent` spawn or external-agent dispatch of a run, state the model and effort and get a yes. Ask once per run, then hold the choice. In OpenCode this means the `subagent` tool's `model` parameter (`provider/model`, or `provider/model#variant` for a reasoning level); never set it silently.
- **Answer first.** Most important information at the start.
- **Only what was requested,** at the intended scope. No unrequested cleanup, refactors, docs, or adjacent features. No abstractions for imagined requirements.
- **Explain the why in one or two lines,** only where the choice was non-obvious.
- **Teach as you go.** One line, only when it changes what the user would do next.
- **Restate finished work concisely.** What shipped, what was verified.

## 4. How to write

- Lead with the answer or outcome, then only the reasoning, evidence, or next step needed.
- Plain words, concrete details, active verbs. Say what changed, why it matters, what was verified. Separate verified facts from assumptions.
- Calm, candid, colleague tone. No praise or enthusiasm. Disagree when evidence warrants.
- Connected prose in complete sentences. Short answers are one concise paragraph. Default to paragraphs; lists for parallel items or steps; headings only for longer answers; tables for comparisons.
- State each point once. No preamble, no recap section, no offers to continue when the work is done.
- Progress updates cover a finding, a decision, or the next useful step. Do not narrate every tool call.
- Avoid canned framing: no rhetorical Q&A pairs, no "This isn't about X, it's about Y", no invented labels, vague qualifiers, or self-congratulation.
- Avoid filler: "Great question", "Absolutely", "Here's the honest truth", "It's worth noting", "Importantly", "Bottom line", "In short". Avoid "delve", "foster", "leverage" when a plain verb works.
- No flattery, motivational language, emojis, decorative headings, dash chains. Em dashes sparingly.
- Banned phrases: "load bearing", "worth stating plainly", "the real tension", "carry the argument".
- Use reference codes (`D1`, `O1`, `F1`) only when asked or when tracking items across a review.

Example. Q: "Is legacy config.json still referenced?" Good: "No. The only match is the file itself. No imports, runtime reads, build references, or doc links." Bad: "Great question. I will search the repository and determine whether this file is still load-bearing..."

### Aliases (expand only when the message is exactly the alias)
- `scr` = Simplify, compress, and repeat your response.
- `eli` = Explain this like I'm 18. Simpler language, shorter.
- `foc` = What matters most here? Boil it down to the single most important thing.
- `ref` = Rewrite your response with reference points.

---

## 5. Coding practices

- State the approach before editing.
- Match existing style: conventions, naming, patterns.
- Small, focused changes. No rewrites, no unrelated code.
- No unexplained literals. Name a value when its meaning isn't obvious at the use site, when it repeats, or when it is environment-specific.
- Centralize external calls: Supabase and HTTP calls go through the service layer in `src/lib/`, never inline in components.
- Validate before done: run `npx tsc --noEmit` and the relevant tests, confirm they pass.
- **New module folders only** (a directory of related files imported as a unit; not single files, not existing folders you are merely editing):
  - One entry file (`index.ts`) exporting only the public interface; outside code imports only from it.
  - A `README.md`: what it does, public interface, what it does NOT handle, dependencies.
  - Implementation in `_internal/` or `_helpers/`.

---

## 6. UI / UX design

**Show, don't describe.** An open visual question (layout, color, spacing, motion, comparing options) is answered with the `ui-preview` skill (section 10.5), not text. Skip it for small changes, or when the user says "skip the preview".

### Design system
`DESIGN_IDENTITY.md` (repo root, the ABYAN UI Design Identity Guide) is the source of truth for color, type, spacing, components, status badges. Tokens live in `src/styles/abyan-tokens.css`. It is 66 KB, too large to inline in `AGENTS.md`; load it explicitly before UI work.

- **How it loads in OpenCode.** Claude Code used an `@DESIGN_IDENTITY.md` import inside `CLAUDE.md`. OpenCode has no `@` import in rules files. Either add it to the `instructions` array in `opencode.json` so it loads every session:

  ```jsonc
  { "instructions": ["AGENTS.md", "DESIGN_IDENTITY.md"] }
  ```

  or leave it out of the array and read the file when a UI task starts. The second keeps the context cost down and is the current choice.
- Use its tokens and components: colors from the token file (no hard-coded hex), `.btn` classes for buttons, the section 10 status map for badges.
- Run its section 16 PR checklist before calling a UI change done.
- Don't sweep. Fix existing drift only in files already being touched.
- Mockups set layout; `DESIGN_IDENTITY.md` sets tokens. If a saved mockup conflicts with a token, flag it before building.
- Changing a token is a decision: ask first, then update `DESIGN_IDENTITY.md` and `abyan-tokens.css` together.

### Check the mockups first
Before answering a UI design question, proposing layouts, or building a surface, check `docs/mockups/` (saved decisions) and `docs/mockups/sessions/`.
- List the whole directory and read the matches. Filenames are dated; the match may be anywhere. Never conclude "absent" from a truncated listing.
- A found mockup is the decision. Build to it and name the file. Read it; don't reconstruct from memory.
- Don't re-ask a settled question.
- Deviate only when the user asks for a change or a later decision conflicts; say so and name what changed.

### Mockup files
Sessions live in `docs/mockups/sessions/` (gitignored). Save a chosen mockup to `docs/mockups/YYYY-MM-DD-<topic>.html` and link it from the plan or ADR recording the decision. `ui-preview` needs Node.js and Git Bash.

### Optional craft layer (not installed)
The user's Claude Code setup also used an `impeccable` skill (`~/.claude/skills/impeccable/SKILL.md`: critique, audit, polish, harden) and a global `~/.claude/CRAFT.md` motion/typography/color checklist, imported via `@CRAFT.md` and `@RTK.md`. Neither is installed here, and the two imported files were already missing when this handoff was first written. If the skill is installed later, its lanes apply: A = tiny tweak, just do it; B = existing surface, layout/behavior changes (preview if open, build, critique, audit, polish); C = nothing built or a full redesign (shape, build, critique, audit, polish, harden). Lanes are exclusive. Never silence a finding without asking.

---

## 7. Development flow (feature work)

1. `/grill-me` or `/grill-with-docs` sharpens the idea (section 10). The second also writes glossary terms to `CONTEXT.md` and hard-to-reverse decisions to `docs/adr/`.
2. Save the plan in `docs/plans/` and get approval.
3. Build in small, verified steps.
4. `/code-review` on the whole branch once the plan is done. **This command does not exist yet** — it is referenced by the original Claude Code setup but is defined nowhere in this repo or in the handoff folder. Until it is written, run a review by asking for one explicitly, or add `.opencode/commands/code-review.md`.

The global Claude Code setup also referenced `/wayfinder`, `/to-spec`, `/to-tickets`, `/implement`, `/tdd`, `/agent-loop`. None are defined here and none are ported.

## 8. Documentation

Read `CONTEXT.md` (if present) and existing `docs/plans/` at the start of feature work. Drill into individual plans only as needed.

When a plan is confirmed, **before any code**:
1. Save it at `docs/plans/YYYY-MM-DD-<topic>.md`, starting from `docs/plans/_template.md`. Frontmatter: `title`, `date`, `status`, `summary`, optional `spec`. Sections: Goal, Approach, Steps, Risks, Checks to run. One plan, one file. Never edit code from an unsaved plan.
2. Keep `status` current: `Draft → Approved → In Progress → Blocked → Done`.
3. On completion write `docs/session-summaries/YYYY-MM-DD-<topic>-summary.md`: shipped vs. planned, deviations, checks run. Update it if the plan changes later without being asked.

After any plan or summary change, regenerate the dashboard: `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`. Never hand-write `index.html`.

Folders are created lazily. ADRs go in `docs/adr/NNNN-slug.md`, only for decisions that are hard to reverse, surprising without context, and the result of a real trade-off.

## 9. Git and commits

- Commit at logical stops; say what you're committing, then commit. Don't batch unrelated changes.
- Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, optional scope like `feat(succession):`.
- Never work on `main`/`master`; branch first.
- Confirm before any push. Never force-push or rewrite shared history without a go-ahead. Never skip hooks or signing (`--no-verify`).
- **No AI signature.** No `Co-Authored-By` trailer for the agent, no "Generated with ..." line, in commits or PRs. If a tool injects one by default, remove it; the user's rule wins.
- PRs include: what changed and why, the linked issue, migration notes for schema changes, and the checks run with results.

---

## 10. Skills (full text)

Where they live: `<repo>/.claude/skills/<name>/SKILL.md`. OpenCode searches `.claude/skills` as a project compatibility source, so the skills are already active without being copied to `.opencode/skills/`. Precedence puts `.opencode/skills` above `.claude/skills`; do not create a second copy, because the newer one silently wins on duplicate IDs and the two drift.

Invocation in OpenCode:
- The model loads a skill by exact ID with the `skill` tool, e.g. `skill({ id: "grilling" })`. The ID is the directory name, case-sensitive, not the frontmatter `name`.
- The user can mention `@grilling` in a prompt.
- A skill with `disable-model-invocation: true` (or `metadata.opencode/autoinvoke: false`) is hidden from the model's list and can only be loaded explicitly. That is how `grill-me` and `grill-with-docs` stay user-invoked.
- Slash commands live in `.opencode/commands/<name>.md`. `/grill-me` and `/grill-with-docs` exist there and delegate to the skills, so the procedure text has one home.

### 10.1 `grilling`
Trigger: user wants to stress-test a plan before building, or uses any "grill" phrase.

> Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.
>
> Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.
>
> If a *fact* can be found by exploring the codebase, look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.
>
> Do not enact the plan until I confirm we have reached a shared understanding.

### 10.2 `grill-me` (user-invoked only)
Run a `grilling` session. Invoke as `/grill-me`, backed by `.opencode/commands/grill-me.md`.

### 10.3 `grill-with-docs` (user-invoked only)
Run a `grilling` session, using the `domain-modeling` skill (10.4), so ADRs and the glossary get written as you go. Invoke as `/grill-with-docs`, backed by `.opencode/commands/grill-with-docs.md`.

### 10.4 `domain-modeling`
Trigger: pin down domain terminology / ubiquitous language, record an architectural decision, or another skill needs to maintain the domain model. This is the *active* discipline; merely reading `CONTEXT.md` for vocabulary is not this skill.

**File structure.** Most repos: root `CONTEXT.md` plus `docs/adr/0001-slug.md`, `0002-slug.md`. If `CONTEXT-MAP.md` exists at root, the repo has multiple contexts: each lives at `src/<ctx>/CONTEXT.md` with its own `docs/adr/`; system-wide ADRs stay in root `docs/adr/`. Create files lazily: `CONTEXT.md` when the first term is resolved, `docs/adr/` when the first ADR is needed.

**During the session**
- *Challenge against the glossary.* If the user's term conflicts with `CONTEXT.md`, call it out at once ("Your glossary defines 'cancellation' as X, but you seem to mean Y — which is it?").
- *Sharpen fuzzy language.* Propose a precise canonical term for vague or overloaded ones ("account: Customer or User?").
- *Discuss concrete scenarios.* Invent edge-case scenarios to force precision about boundaries between concepts.
- *Cross-reference with code.* When the user states how something works, check the code. Surface contradictions ("Your code cancels entire Orders, but you said partial cancellation is possible — which is right?").
- *Update CONTEXT.md inline.* Write each term the moment it resolves; don't batch. `CONTEXT.md` is a glossary only: no implementation details, no spec, no scratch pad.
- *Offer ADRs sparingly.* Only when all three hold: (1) hard to reverse, (2) surprising without context, (3) the result of a real trade-off. If any is missing, skip.

**CONTEXT.md format**

```md
# {Context Name}

{One or two sentence description of what this context is and why it exists.}

## Language

**Order**:
{A one or two sentence description of the term}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

Rules: be opinionated (pick one word, list the others under `_Avoid_`); definitions one or two sentences, what it IS not what it does; only project-specific terms, no general programming concepts; group under subheadings when clusters emerge. Multi-context `CONTEXT-MAP.md` has a `## Contexts` list (`- [Ordering](./src/ordering/CONTEXT.md) — one-line purpose`) and a `## Relationships` list (`- **Ordering → Fulfillment**: Ordering emits OrderPlaced; Fulfillment consumes it`). If unclear which context a topic belongs to, ask.

**ADR format.** Path `docs/adr/NNNN-slug.md`, number = highest existing + 1. Template:

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

One paragraph is enough. Optional, only when they add value: `Status` frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`), Considered Options (only if rejected alternatives are worth remembering), Consequences (only if non-obvious). Qualifies: architectural shape, integration patterns between contexts, lock-in technology choices, boundary/scope decisions (explicit no's), deliberate deviations from the obvious path, constraints not visible in code, non-obvious rejected alternatives. Easy to reverse, unsurprising, or no real alternative: no ADR.

### 10.5 `ui-preview`
Trigger: a real visual design question (layouts, wireframes, component designs, side-by-side comparisons, architecture diagrams). Test: would the user understand this better by seeing it than reading it? Not for trivial copy/style tweaks. Skip when the user says "skip the preview". Use a runnable prototype instead when the question needs state or logic, not appearance.

Steps:
1. **Resolve the session** every turn: `scripts/session.sh --project-dir <project-root>` prints `{url, screen_dir, state_dir}`. If it prints `{"type":"not-running"}`, run `scripts/session.sh --project-dir <project-root> --start --open` in the background, then repeat. Never strip the `?key=...` from the URL.
2. **Write one screen**: a new file in `screen_dir` via a file-write tool (not heredoc), semantic name, never reuse a filename (`layout.html`, then `layout-v2.html`). Content fragment only (no `<html>`, `<style>`, `<script>`); the server wraps it. Use industry-standard patterns (Material, Apple HIG, Carbon, Polaris, GOV.UK), WCAG 2.1 AA, and the project design system. Options differ in trade-offs, not quality: no strawmen. Label each option with the convention it follows and its main trade-off in one line. Budget: wireframe fidelity unless polish is the question, 2-4 options, frame classes over inline CSS, one screen per turn.
3. **Hand off and stop**: one line naming what's on screen plus the full URL. Don't restate the mockup in chat. End the turn.
4. **Read the reply** next turn: `cat "$STATE_DIR/events"` (JSON lines, newest last; absent = no interaction). Terminal text is primary, events supporting. Iterate with a new version file.
5. **Close out**: copy the winner to `docs/mockups/YYYY-MM-DD-<topic>.html`, link it from the plan/ADR, tell the user the path, then `scripts/stop-server.sh <session_dir>`.

Sessions live in `docs/mockups/sessions/` (gitignored). The skill folder is `.claude/skills/ui-preview/` and contains `SKILL.md`, `classes.md` (fragment markup and CSS classes, read before the first screen), `troubleshooting.md`, and `scripts/` (`session.sh`, `start-server.sh`, `stop-server.sh`, `server.cjs`, `helper.js`, `frame-template.html`). Needs Node.js and Git Bash.

### 10.6 Not installed
- `impeccable` (`~/.claude/skills/impeccable/SKILL.md`): large frontend-design skill. Install it into `.opencode/skills/` or `~/.config/opencode/skills/` if wanted; it is not present now.
- Anthropic and plugin skills (docx, pdf, xlsx, pptx, superpowers, design:*, etc.) are product-provided, not the user's rules.
- Supabase's own skills are installed globally by `npx skills add supabase/agent-skills` into `~/.agents/skills/` (`supabase`, `supabase-postgres-best-practices`). OpenCode reads that path. They carry schema and migration guidance that can conflict with section 1; the repo rule wins.

---

## 11. Install checklist (OpenCode)

Already done in this repo, listed so it can be repeated elsewhere:

1. `AGENTS.md` at the repo root holds sections 2-9 in condensed form and loads every session. OpenCode also reads `CLAUDE.md` if present; keep one authoritative copy.
2. Skills live in `.claude/skills/` and are discovered as a project compatibility source. Verify with the `skill` tool or by asking which skills are available.
3. `.opencode/commands/grill-me.md` and `grill-with-docs.md` provide the two user-invoked entry points.
4. `DESIGN_IDENTITY.md` and `src/styles/abyan-tokens.css` are in the repo and identical to the handoff source.
5. `docs/plans/_template.md` and `docs/plans/build-plans-index.ps1` are present.
6. MCP: `supabase` is configured in `~/.config/opencode/opencode.json` under `mcp.servers` and authenticated by OAuth. Confirm with `opencode mcp list`.
7. Global config lives at `~/.config/opencode/opencode.json`. Project config would live at `.opencode/opencode.json`; this repo has none.
