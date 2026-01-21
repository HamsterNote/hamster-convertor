# Data Model

## Entities

### ConversionTask

- Represents a single file conversion attempt.
- Fields:
  - id (unique identifier)
  - sourceFileName
  - sourceFormat (expected: pdf; non-pdf rejected)
  - targetFormat (html)
  - status (ready | queued | converting | done | failed)
  - warnings (list of messages)
  - errorMessage (optional, when failed)
  - createdAt
  - updatedAt

### ConversionResult

- Represents a successfully generated HTML output.
- Fields:
  - taskId (reference to ConversionTask)
  - htmlContent
  - fileName (derived from source file name)
  - sizeBytes

## Relationships

- ConversionTask 1:1 ConversionResult (only when status = done)

## State Transitions

- ready → queued → converting → done
- ready → queued → converting → failed
- failed → queued → converting (retry)

## Validation Rules

- Only PDF sources are accepted for conversion.
- Download is available only when all tasks are in terminal states and at least one task is done.
- Retry only applies to failed tasks; done tasks remain done.
