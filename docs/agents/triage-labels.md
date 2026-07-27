# Triage Fields

Local issue files use one category and one status field. This file maps canonical roles to the actual values used in the repo.

## Categories

| Canonical category | Local value   | Meaning                     |
| ------------------ | ------------- | --------------------------- |
| `bug`              | `bug`         | Existing behavior is wrong  |
| `enhancement`      | `enhancement` | New behavior or improvement |

## Statuses

| Canonical status  | Local value       | Meaning                                   |
| ----------------- | ----------------- | ----------------------------------------- |
| `needs-triage`    | `needs-triage`    | Maintainer evaluation required            |
| `needs-info`      | `needs-info`      | Waiting for missing information           |
| `ready-for-agent` | `ready-for-agent` | Fully specified, ready for an AFK agent   |
| `ready-for-human` | `ready-for-human` | Requires human implementation or judgment |
| `wontfix`         | `wontfix`         | Deliberately not actioned                 |

When a skill mentions a canonical role, write the mapped value into the local file's `Category:` or `Status:` field. Edit only the local-value column when the repo already uses different vocabulary.
