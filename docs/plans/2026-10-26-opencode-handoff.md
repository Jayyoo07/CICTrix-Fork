---
title: Retarget the agent handoff to OpenCode
date: 2026-10-26
status: Done
summary: Rewrite docs/handoff/agent-handoff.md for OpenCode instead of Claude Code, and add the two missing slash commands so /grill-me and /grill-with-docs work as AGENTS.md describes.
---

## Goal

`docs/handoff/agent-handoff.md` describes this repo's rules and skills in terms OpenCode actually uses, so the file can be followed without translating Claude Code paths and tool names. `/grill-me` and `/grill-with-docs` become real OpenCode commands. The five skills stay in `.claude/skills/`, which OpenCode already reads.

No mockup governs this change; it is documentation and command wiring.

## Approach

The handoff content is already installed byte-for-byte from `C:\Users\ajcbu\Documents\College\Fourth Year\handoff\handoff official` — `DESIGN_IDENTITY.md`, `src/styles/abyan-tokens.css`, and the handoff itself all match. Only the OpenCode translation is missing.

The rewrite keeps every rule and every paragraph of intent, replacing the Claude-specific mechanics:

| Claude Code | OpenCode |
| --- | --- |
| `CLAUDE.md` | `AGENTS.md` |
| `~/.claude/skills/<name>/` | `~/.config/opencode/skills/<name>/` or `.opencode/skills/<name>/` |
| `@DESIGN_IDENTITY.md` import | `instructions` array in `opencode.json` |
| `disable-model-invocation: true` | `metadata.opencode/autoinvoke: false` (both accepted) |
| Skill tool | `skill` tool, loaded by exact ID |
| Subagent model gate | `subagent` tool's `model` parameter |
| `/grill-me` as a hidden skill | `.opencode/commands/grill-me.md` |

Skills are not copied to `.opencode/skills/`. OpenCode reads `.claude/skills/` as a compatibility source, the skills are confirmed live in-session, and a second copy would silently win on duplicate IDs while drifting from the first. Rejected: moving them to `.opencode/skills/`, because Claude Code would then lose them for no gain.

`/code-review` is referenced by the dev flow but does not exist anywhere — not in the handoff folder, not in `.claude/skills/`. The handoff records it as absent rather than inventing a procedure.

## Steps

1. Rewrite `docs/handoff/agent-handoff.md` with the OpenCode equivalents above, plus a short MCP section recording that `supabase` is connected by OAuth and that `opencode mcp auth` must not be driven non-interactively.
2. Add `.opencode/commands/grill-me.md` and `.opencode/commands/grill-with-docs.md`, each loading the existing skill by ID so the procedures stay in one place.
3. Regenerate `docs/plans/index.html` with `build-plans-index.ps1`.
4. Confirm the commands are discovered and that no skill ID resolves twice.

## Risks

- The two new commands duplicate the skills' one-line bodies. If a skill's procedure changes, the command text must not be treated as the source of truth; each command delegates to the skill ID.
- `AGENTS.md` already carries a condensed version of these rules. Rewriting the handoff leaves two descriptions of the same rules, which can drift. The handoff is the long-form reference; `AGENTS.md` stays the operational copy.
- OpenCode reloads commands on save, so a malformed frontmatter block shows up as a missing command rather than an error.

## Checks to run

- `opencode mcp list` still reports `supabase connected`.
- Read back both command files and confirm frontmatter parses as YAML.
- Confirm no `.opencode/skills/` directory was created.
- `git status` shows only the intended files as changed or added.
