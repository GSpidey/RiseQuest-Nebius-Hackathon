# RiseQuest public source guidance

Keep changes scoped to this repository and preserve working features. This is the public development snapshot; use your own service configuration and signing identity. Never publish credentials, user data or private deployment files.

## Browser continuity

The owner requests long-lived project tabs. Reuse existing matching tabs first. Cloud Browser closes unmarked agent-created tabs automatically at turn end: call `tab.markDeliverable()` for pages explicitly requested to stay open and `tab.markHandoff()` for unfinished workflows. Marks are turn-scoped and must be reapplied every turn. Never replace a pending authentication handoff mark. Leave task tabs open; do not sign out or clear session state as cleanup. Record canonical non-secret page URLs and verified progress in a private handoff, never credentials. Cross-chat persistence is platform-dependent; reopen recorded URLs and use secure sign-in if needed.

## Verification

See README.md and SOURCE_SNAPSHOT.md. Distinguish prepared, committed, pushed and published work. Source tests do not prove native builds, live purchases or store review.
