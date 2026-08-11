# AgentDeck Focus Console UI Design

## Objective

Rebuild the existing V2 frontend as a compact Chinese-localized developer console without changing APIs, domain state, Git/Worktree services, or Codex behavior.

## Visual system

- Background: graphite and blue-grey layers (`#0d1117`, `#121923`, `#171f2b`), never pure black.
- Typography: Geist/system sans for UI; `ui-monospace` for paths, branches, SHAs, event names, and diffs.
- Geometry: 6–10px radii, 1px low-contrast dividers, 8px spacing scale, tabular numbers.
- Statuses: running blue-violet; waiting input amber; review teal; merge-ready green; failed red; done/cleaned muted green-grey.
- Interaction: visible `:focus-visible`, short opacity/transform transitions honoring reduced motion, semantic buttons/links, and concise Chinese labels.

## Layout

The app shell is a responsive grid: project navigation at desktop widths, a contextual top bar, and a full-width main area. The project page is a command center with project metadata, a segmented execution-mode control, a priority-first task table, and an explicit non-Git explanation. The task page is a three-panel review surface: operations/worktree, live activity/human input, and review files/diff/commits; it becomes a vertical layout on narrow screens.

## Boundaries

This work changes only React pages/components and CSS, plus Playwright assertions for UI states. Forms retain their existing request bodies and IDs. No server route, Git argument, filesystem path, Worktree/Codex state, or action authorization behavior changes.

## Verification

Use browser snapshots/screenshots at desktop and narrow widths, plus existing Playwright flows extended for non-Git isolation state, human-input priority, review, failure/cleanup, and narrow-screen usability. Run unit tests, lint, build, and the full Playwright suite.
