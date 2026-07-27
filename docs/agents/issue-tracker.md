# Project tracker: Local Markdown

PRDs, tickets, triage records, and project decisions for this repo live as Markdown files in `.scratch/`. Remote issue trackers are read-only sources, not destinations.

## Conventions

- One project or workstream per directory: `.scratch/<project-slug>/`
- Reserved: `.scratch/planning/` is durable agent execution state, not an issue/PRD feature directory.
- Reserved: `.scratch/wayfinder/` is for wayfinding maps and decision tickets, not ordinary implementation issues.
- The spec/PRD is `.scratch/<project-slug>/PRD.md`.
- The compact ticket breakdown is `.scratch/<project-slug>/tickets.md`.
- Implementation issues may also be `.scratch/<project-slug>/issues/<NN>-<slug>.md`, numbered from `01`, when per-ticket lifecycle/comments matter.
- Rejected-request memory lives in `.scratch/<project-slug>/out-of-scope/<concept>.md`.
- Triage state is recorded as `Category:` and `Status:` lines near the top of each issue file; see `triage-labels.md`.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Remote references

GitHub/GitLab issue numbers, URLs, bodies, comments, and PRs may be read as source material. Record them as `Source: <url-or-ref>` in the local PRD, ticket, or triage file. Never create, edit, label, comment on, or close a remote issue from this workflow.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<project-slug>/` (creating the directory if needed). `/to-spec` writes `spec.md` (PRD remains a compatibility filename); `/to-tickets` writes `tickets.md` by default or issue files under `issues/` when lifecycle requires it. Never publish project artifacts under `.scratch/planning/`.

## When a skill says "fetch the relevant ticket"

Read the local file at the referenced path. If the user gives a remote URL or issue number, read it only as a source and create or update the corresponding local file before triage or planning.

## Wayfinding operations

Used by `/wayfinder`. Maps live in `.scratch/wayfinder/<effort-slug>/`.

- **Map**: `.scratch/wayfinder/<effort-slug>/map.md`, holding Destination, Notes, Decisions So Far, Not Yet Specified, and Out Of Scope.
- **Child ticket**: `.scratch/wayfinder/<effort-slug>/tickets/<NNN>-<slug>.md`, with `Type: research|prototype|grilling|task`, `Status: open|claimed|resolved|blocked|out-of-scope`, and `Blocked by:`.
- **Blocking**: `Blocked by: <NNN>, <NNN>` near the top. A ticket is unblocked when every listed ticket is `resolved`.
- **Frontier**: open tickets with no unresolved blockers and no active claim, read in numeric order.
- **Claim**: set `Status: claimed` before any work.
- **Resolve**: fill `## Answer`, set `Status: resolved`, and append a one-line pointer to the map's Decisions So Far.
