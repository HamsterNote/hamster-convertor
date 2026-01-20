# Research

## Decisions

### Conversion pipeline
- Decision: Implement a client-side PDF → HTML pipeline that reads the uploaded PDF as bytes, converts to HTML, and returns HTML + warnings.
- Rationale: The UI is a Vite/React frontend with existing stubbed conversion and tests; a client-side pipeline aligns with the current architecture and avoids new backend dependencies.
- Alternatives considered: Server-side conversion via API (rejected due to additional backend scope and deployment requirements).

### Parser integration scope
- Decision: Integrate the parsers behind a single `convertPdfToHtml` function and call it from `convertAll`.
- Rationale: Matches existing code structure (converter.ts and App.tsx) and keeps UI logic clean.
- Alternatives considered: Direct parser calls in UI components (rejected due to coupling and testability concerns).

### Download packaging
- Decision: Package successful HTML outputs into a single archive for download once all conversions complete.
- Rationale: Matches clarified requirement and simplifies user workflow for multi-file conversion.
- Alternatives considered: Per-file downloads or mixed download behavior (rejected due to higher UX complexity).
