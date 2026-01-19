# Hamster Document Converter Constitution
<!--
Sync Impact Report
- Version: N/A (template) -> 1.0.0
- Modified Principles: placeholders -> I. Code Quality Baseline, II. Testing Standards (Non-Negotiable), III. User Experience Consistency, IV. Performance Requirements
- Added Sections: Quality Gates, Development Workflow
- Removed Sections: none
- Templates requiring updates: ✅ .specify/templates/plan-template.md, ✅ .specify/templates/spec-template.md, ✅ .specify/templates/tasks-template.md
- Follow-up TODOs: none
-->

## Core Principles

### I. Code Quality Baseline
All code MUST pass lint and formatting checks, follow existing TypeScript patterns, and
avoid `any` or type suppression. Changes MUST be minimal and scoped to the task at hand.
Non-trivial logic MUST include concise comments explaining intent and constraints.

### II. Testing Standards (Non-Negotiable)
Behavior changes MUST include automated tests (unit/integration) or an explicit,
documented waiver with rationale and a manual verification plan. Tests MUST be
reproducible and aligned with user-facing requirements.

### III. User Experience Consistency
UI changes MUST preserve existing layout patterns, component usage, theme behavior, and
responsiveness. All user-visible strings MUST be defined in i18n locales. New UX
patterns require explicit approval and documented rationale.

### IV. Performance Requirements
Changes MUST avoid long main-thread tasks and keep interactions responsive. Any new
dependency or feature that increases bundle size by >10% or >200KB MUST be justified and
measured in the plan. Performance-sensitive flows MUST include a verification note.

## Quality Gates

- Lint/format MUST pass before merge.
- No `any` or type suppression in new/modified code.
- Tests MUST be added or a waiver documented per the Testing Standards principle.
- UX changes MUST confirm i18n coverage and responsive behavior.
- Performance impact MUST be documented when thresholds are exceeded.

## Development Workflow

- Each plan MUST include a Constitution Check with explicit pass/fail notes.
- Deviations from principles MUST be recorded in the Complexity Tracking section.
- PR review MUST confirm quality, test coverage/waiver, UX consistency, and performance
  impact.

## Governance

This constitution supersedes local conventions. Amendments MUST update this file,
record a version bump, and describe impact on templates and workflows. All changes
MUST undergo compliance review during PRs.

**Version**: 1.0.0 | **Ratified**: 2025-01-19 | **Last Amended**: 2026-01-19
