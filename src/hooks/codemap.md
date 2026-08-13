# src/hooks/

## Responsibility

管理 PDF 文件的页面列表加载与缩略图懒渲染。提供一个自定义 Hook (`usePdfPageList`)，将 PDF 文件解析为页面元数据，并通过 IntersectionObserver 实现视口驱动的按需缩略图生成，同时负责 blob URL 的生命周期管理。

## Design

### 核心抽象

- **`PageShell` 类型** — 页面状态模型，包含页码 (`pageNumber`)、缩略图 URL (`thumbnailUrl`)、加载状态 (`idle | loading | loaded | failed`)
- **`usePdfPageList` Hook** — 唯一公开接口，封装 PDF 加载、页面元数据初始化、懒渲染调度、资源清理的全部逻辑

### 内部辅助函数（模块私有）

| 函数                      | 职责                                                  |
| ------------------------- | ----------------------------------------------------- |
| `configurePdfJsWorker`    | 配置 pdfjs-dist 的 Worker 路径（Vite `?url` 导入）    |
| `loadPdfDocument`         | 动态导入 pdfjs-dist，将 ArrayBuffer 转为 PdfDocument  |
| `readFileAsArrayBuffer`   | 优先使用 `File.arrayBuffer()`，回退到 FileReader      |
| `renderPageThumbnail`     | 将单页渲染到离屏 canvas，导出为 PNG blob URL          |
| `isE2E`                   | 检测 `window.__E2E__` 标志，E2E 模式跳过真实 PDF 加载 |
| `createFakeE2EThumbnails` | E2E 模式下生成占位色块缩略图                          |

### 设计模式

- **懒加载策略**: IntersectionObserver + 100px rootMargin，页面卡片进入视口附近才触发渲染
- **状态机模式**: PageShell.status 四态流转 (`idle` → `loading` → `loaded` / `failed`)
- **不可变状态更新**: 状态转换通过 `markLoading/markLoaded/markFailed` 纯函数映射
- **资源生命周期管理**: AbortController 取消异步、blob URL 池统一 revoke、Observer disconnect

## Flow

```
输入: File 对象
  │
  ├─ useEffect #1 [file 变更触发]
  │   ├─ 重置状态 + 清理旧资源
  │   ├─ E2E? → 直接生成假缩略图，结束
  │   ├─ readFileAsArrayBuffer(file)
  │   ├─ loadPdfDocument(arrayBuffer)  ← 动态导入 pdfjs-dist
  │   ├─ 创建 N 个 PageShell (status='idle', thumbnailUrl=null)
  │   └─ setLoading(false)
  │
  ├─ useEffect #2 [pdfDocument + pageShells.length 变更触发]
  │   ├─ 检查 gridRef.current 是否挂载
  │   ├─ 创建 IntersectionObserver (root=grid, rootMargin=100px)
  │   ├─ 观察所有 [data-page-number] 元素
  │   └─ 进入视口时:
  │       ├─ markLoading → status='loading'
  │       ├─ pdfDocument.getPage(n)
  │       ├─ renderPageThumbnail(page, scale=0.4)
  │       ├─ 存入 objectUrlsRef
  │       └─ markLoaded → status='loaded', thumbnailUrl=blob:...
  │
  └─ useEffect #0 [cleanup]
      ├─ isMountedRef = false
      ├─ revokeObjectUrls()  ← 释放所有 blob URL
      └─ observer.disconnect()

输出: { pageShells: PageShell[], loading: boolean, error: string | null, gridRef: RefObject }
```

## Integration

### 外部依赖

| 依赖                                  | 用途                                     |
| ------------------------------------- | ---------------------------------------- |
| `react`                               | useState, useEffect, useCallback, useRef |
| `pdfjs-dist`                          | PDF 解析与页面渲染（动态导入）           |
| `pdfjs-dist/build/pdf.worker.mjs?url` | Vite 专用 Worker URL 导入                |

### 消费模块

| 文件                                       | 用法                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `src/components/PdfPageSelectorInline.tsx` | 内联 PDF 页面选择器，绑定 `gridRef` 到网格容器 |
| `src/components/PdfPageSelectorModal.tsx`  | 模态框 PDF 页面选择器，同上模式                |
| `src/__tests__/app.upload.test.tsx`        | 单元测试中 mock 该 Hook                        |
| `src/components/SettingsModal.test.tsx`    | 单元测试中 mock 该 Hook                        |

### 接口契约

```typescript
// 公开导出
export type PageShell = {
  pageNumber: number
  thumbnailUrl: string | null
  status: 'idle' | 'loading' | 'loaded' | 'failed'
}

export function usePdfPageList(file: File): {
  pageShells: PageShell[]
  loading: boolean
  error: string | null
  gridRef: React.RefObject<HTMLDivElement | null>
}
```

消费者必须将 `gridRef` 绑定到包含 `[data-page-number]` 属性子元素的容器 div，IntersectionObserver 才能正常工作。
