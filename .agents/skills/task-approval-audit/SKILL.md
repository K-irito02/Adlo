---
name: task-approval-audit
description: Project-specific rules for task state machines, approval flows, audit logging, checkpoint references, and dangerous action governance in AI Digital Life. Use when changing task lifecycle, approval logic, risk grading, or audit requirements.
---

# Task Approval Audit

Use this skill when the task changes task governance or dangerous action policy.

## Core rules

- Keep task orchestration separate from system execution.
- Make task states explicit and one-way.
- Distinguish failure, rejection, timeout, and rollback.
- Require auditability for high-risk actions.

## Approval model

- Low risk: warn or auto-approve as configured
- Medium risk: block until requirements are satisfied
- High risk: approval required

## Checkpoint expectations

- Phase 0 checkpoints are recovery and audit anchors.
- Do not pretend checkpoints are already a full change engine.
- Link risky tasks to checkpoint references when relevant.

## Required outputs

- explicit risk level
- approval trigger reason
- audit record shape
- rollback or recovery note for risky flows

## Avoid

- hidden task transitions
- untracked destructive actions
- mixing approval UI concerns into low-level services
