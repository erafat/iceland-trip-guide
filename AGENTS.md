---
type: repo_instructions
scope: iceland-trip-guide
updated: 2026-04-25
---

# Iceland Trip Guide Repo

## Objective
- Maintain the public static Iceland itinerary site for GitHub Pages.

## Working Rules
- Keep the site static: HTML, CSS, JavaScript, and committed generated data only unless the user explicitly asks for a backend.
- Preserve the existing editorial travel direction unless the user asks for a redesign.
- Treat the separate BaseCamp project folder as the planning/control surface:
  `/Users/erafat/Library/Mobile Documents/iCloud~md~obsidian/Documents/BaseCamp/Projects/Iceland Trip Guide`
- Sync project-level decisions back to that folder when architecture, deploy flow, or operating rules change.

## Git Workflow
- Use atomic commits: each commit should cover one logical change only.
- Stage only the files relevant to that change.
- After verification, push the deploy repo without waiting for an extra confirmation unless the user explicitly says not to push.
