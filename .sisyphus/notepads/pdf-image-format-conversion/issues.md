## 2026-05-01 Manual QA

- REJECT: `src/components/PdfPageSelectorModal.tsx` revokes already-tracked thumbnail blob URLs and disconnects the observer on close, but in-flight thumbnail renders can finish after close because `isMountedRef` remains true while the component is still mounted. Those late renders push new blob URLs and update state after the close cleanup has already run, so blob URLs are not reliably revoked on close.

## 2026-05-01 Code Quality Re-review

- REJECT: `src/components/PdfPageSelectorModal.tsx` still only guards in-flight thumbnail rendering with component mount state, not modal-open state, so prop-driven close can still allow late blob URL registration after close cleanup.
- REJECT: LSP/Biome reports modal diagnostics: unnecessary hook dependency and `forEach` callback return in observer setup.

## 2026-05-01 Plan Compliance Re-audit

- REJECT: `src/components/PdfPageSelectorModal.tsx` still allows in-flight thumbnail renders to register blob URLs after an `open=false` close cleanup because `isMountedRef` does not track modal-open/run state.
- REJECT: LSP diagnostics are not clean for `src/components/PdfPageSelectorModal.tsx`: `useIterableCallbackReturn` at line 295 and unnecessary `t` dependency at line 244.
- REJECT: E2E fake image conversion in `src/lib/converter.ts` returns `fake.webp` for image→WEBP, while `e2e/app.spec.ts` expects `photo.webp` for the uploaded source name.
