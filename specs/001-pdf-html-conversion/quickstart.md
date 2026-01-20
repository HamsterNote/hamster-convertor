# Quickstart

## Goal
Enable PDF → HTML conversion in the UI with a single “Convert All” action and a packaged download once all conversions finish.

## User Flow
1. Upload files (PDFs are eligible for conversion; non-PDFs are marked unsupported).
2. Click “Convert All” to start conversion.
3. Wait for all conversions to finish.
4. Download a single archive containing all successful HTML outputs.
5. If failures exist, re-run “Convert All” to retry failed items only.

## Verification
- Upload at least one PDF and one non-PDF file; non-PDF is marked unsupported and excluded.
- Run “Convert All” and confirm status transitions queued → converting → done/failed.
- Verify download becomes available only after all items complete.
- Confirm the downloaded archive contains only HTML outputs for successful PDF conversions.
