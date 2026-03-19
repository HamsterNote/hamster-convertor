# Implementation Plan: PDF 转 HTML 转换

**Branch**: `001-pdf-html-conversion` | **Date**: 2026-01-19 | **Spec**: specs/001-pdf-html-conversion/spec.md
**Input**: Feature specification from `/specs/001-pdf-html-conversion/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

打通 PDF → HTML 的前端转换链路：在 UI 中完成上传、批量转换、状态展示与打包下载，并通过统一的转换模块接入解析器。

## Technical Context

**Language/Version**: TypeScript (Vite + React, ESM)  
**Primary Dependencies**: React, i18next, loglevel, @hamster-note/pdf-parser, @hamster-note/html-parser  
**Storage**: N/A (in-memory during session)  
**Testing**: Vitest, Testing Library, Playwright  
**Target Platform**: Web (modern browsers)  
**Project Type**: single (frontend)  
**Performance Goals**: 单个 PDF 转换在 60 秒内完成，UI 交互不中断  
**Constraints**: 避免长时间阻塞主线程；新增依赖如超过阈值需在计划中记录  
**Scale/Scope**: 单次批量转换 1–50 个文件

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- Code Quality Baseline: lint/format pass, no `any` or type suppression
- Testing Standards: tests added or waiver + manual verification plan documented
- UX Consistency: i18n coverage confirmed, responsive behavior validated
- Performance Requirements: impact measured and noted if thresholds exceeded

## Project Structure

### Documentation (this feature)

```text
specs/001-pdf-html-conversion/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── App.tsx
├── components/
├── i18n/
├── lib/
└── styles/

src/__tests__/
src/test/
```

**Structure Decision**: 单一前端项目结构，核心逻辑在 `src/App.tsx` 与 `src/lib/`，测试位于 `src/__tests__` 与 `src/test`。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
