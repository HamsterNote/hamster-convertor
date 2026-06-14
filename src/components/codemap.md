# src/components/

## Responsibility

This directory contains all React UI components for the Hamster Document Converter application. It provides the complete user interface layer including:

- **Modal Dialogs**: Confirmation, settings, preview, and PDF page selection modals
- **File Upload**: Drag-and-drop file upload zone
- **Layout Components**: Header with language switcher and footer with links
- **Loading States**: Full-screen loading overlay
- **Parser Bridge**: Iframe-based parser runtime communication bridge

## Design

### Component Architecture

| Component                | Type    | Purpose                                                   |
| ------------------------ | ------- | --------------------------------------------------------- |
| `ConfirmModal`           | Modal   | Reusable confirmation dialog with default/danger variants |
| `FileDropzone`           | Input   | Drag-and-drop + click file upload with accept filter      |
| `Footer`                 | Layout  | App footer with copyright and external links              |
| `FullscreenLoading`      | Overlay | Full-screen loading spinner with label                    |
| `Header`                 | Layout  | App header with logo and i18n language selector           |
| `HtmlDecodeOptionsModal` | Modal   | HTML text control options (font, color, layout)           |
| `HtmlOptionsModal`       | Modal   | Comprehensive HTML options (background, text, layout)     |
| `ParserIframeBridge`     | Bridge  | MessageChannel-based iframe parser communication          |
| `PdfPageSelectorInline`  | Inline  | Inline PDF page thumbnail selector                        |
| `PdfPageSelectorModal`   | Modal   | Modal PDF page thumbnail selector                         |
| `PreviewModal`           | Modal   | Multi-format file preview (PDF, HTML) with tabs           |
| `SettingsModal`          | Modal   | Unified settings for PDF, HTML, image conversions         |

### Common Patterns

**1. Modal Pattern**
All modals follow a consistent structure:

```tsx
type ModalProps = {
  open: boolean // Controls visibility
  onCancel: () => void // Close/cancel handler
  onConfirm: (data) => void // Submit handler (where applicable)
}
```

**2. Draft State Pattern**
Settings/Options modals use a "draft" pattern for form state:

- Initialize draft from props on modal open
- Edit draft locally without affecting parent
- Clean/validate on confirm before returning

**3. i18n Integration**
All components use `react-i18next` for translations:

```tsx
const { t } = useTranslation()
```

**4. Keyboard Support**

- ESC key closes modals
- Auto-focus on confirm buttons

**5. Accessibility**

- ARIA roles (`dialog`, `modal`, `status`)
- `aria-label`, `aria-modal`, `aria-pressed` attributes
- Keyboard navigation support

### Type System

All components use TypeScript with exported types:

```typescript
export type { ConfirmModalProps, SettingsOptions, SettingsSection }
```

## Flow

### File Upload Flow

```
User → FileDropzone → onFiles callback → App.tsx (file list)
```

### Conversion Settings Flow

```
App.tsx → SettingsModal (open) → User edits draft → onConfirm → App.tsx (stores options)
```

### Parser Bridge Flow

```
App.tsx → ParserIframeBridge.convert() → MessageChannel → Iframe Parser → Result
                                              ↓
                                     Progress updates via getProgress()
```

### Preview Flow

```
App.tsx → PreviewModal (open) → Load result (PDF/HTML) → Render preview
                   ↓
         PDF: pdf.js canvas rendering
         HTML: iframe with blob URL
```

### PDF Page Selection Flow

```
App.tsx → PdfPageSelectorInline/Modal → usePdfPageList hook → Thumbnails
                                    ↓
                           onSelectedPagesChange → App.tsx (page list)
```

## Integration

### External Dependencies

| Package                           | Usage                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| `react`                           | Core React hooks (useState, useEffect, useRef, useCallback) |
| `react-i18next`                   | Translation hook `useTranslation()`                         |
| `@hamster-note/parser-protocol`   | Parser bridge request/response types                        |
| `pdf.js` (via `../lib/pdf-utils`) | PDF document loading and rendering                          |

### Internal Dependencies

| Module                 | Import From                   | Purpose                                                                    |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------- |
| `converter`            | `../lib/converter`            | ConversionResult, HtmlDecodeOptions, HtmlLayoutOptions, ExifCategory types |
| `pdf-utils`            | `../lib/pdf-utils`            | `loadPdfDocument` for PDF preview                                          |
| `parser-bridge/client` | `../lib/parser-bridge/client` | BridgeClient, BridgeError, createBridgeClient                              |
| `parser-bridge/url`    | `../lib/parser-bridge/url`    | `getParserRuntimeUrl()` for iframe src                                     |
| `usePdfPageList`       | `../hooks/usePdfPageList`     | PDF page list hook with thumbnails                                         |

### Consumer Modules

| Consumer  | Components Used                                |
| --------- | ---------------------------------------------- |
| `App.tsx` | All components - main application orchestrator |

### Component Composition

```
App.tsx
├── Header
├── FileDropzone
├── SettingsModal
│   └── PdfPageSelectorInline
├── PdfPageSelectorModal
├── HtmlOptionsModal
├── HtmlDecodeOptionsModal
├── ConfirmModal
├── PreviewModal
├── FullscreenLoading
├── ParserIframeBridge
└── Footer
```

### CSS Class Naming Convention

All components use BEM-style naming with `pdf-modal` prefix:

- `.pdf-modal-overlay` - Modal backdrop
- `.pdf-modal__header` - Modal header
- `.pdf-modal__body` - Modal content
- `.pdf-modal__actions` - Modal footer actions
- `.pdf-modal__card` - Selectable card items
- `.btn`, `.btn--primary`, `.btn--secondary`, `.btn--ghost` - Button variants
