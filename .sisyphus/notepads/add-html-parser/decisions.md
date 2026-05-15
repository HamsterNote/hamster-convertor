# Decisions

- Use source-aware E2E fake results in `src/lib/converter.ts` so HTML-target downloads keep the uploaded filename extension.
- Keep the real PDF -> HTML E2E path intact while returning lightweight fake HTML/TXT blobs for TXT -> HTML and HTML -> TXT.
