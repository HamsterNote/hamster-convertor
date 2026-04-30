# Conversion UI Optimizations - Decisions

## Task 8 E2E Hardening - 2026-04-30

- Preserve `undefined` PDF image page selections as “all pages” to match converter defaults and avoid forcing users through the modal for the default flow.
- Keep E2E-only conversion latency in the fake conversion path so loading-overlay assertions observe real UI state without slowing production conversions.
