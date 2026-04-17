---
name: release-readiness
description: Project-specific release preparation rules for AI Digital Life. Use when preparing versions, packaging, migrations, compatibility checks, release notes, or final go/no-go reviews for a milestone.
---

# Release Readiness

Use this skill for milestone freeze, version prep, or release review.

## Release checklist themes

- buildability
- migration safety
- compatibility
- recovery and rollback
- documentation completeness
- residual risk visibility

## Required checks

- version and migration notes are aligned
- risky changes have verification evidence
- compatibility assumptions are stated
- recovery expectations are documented
- docs and manifests reflect the final state

## Escalate when

- data shape changes without migration guidance
- packaging assumptions are unverified
- release notes omit known risks
- hook or governance changes are undocumented

## Avoid

- shipping undocumented migration risk
- assuming release readiness from successful local edits alone
