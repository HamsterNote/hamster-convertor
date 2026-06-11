# packages/parser-runtime/src/types/

## Responsibility

该目录负责为 `@hamster-note/parser-runtime` 包提供 TypeScript 类型声明，特别是为第三方解析器包（如 `@hamster-note/pdf-parser`）提供模块类型定义。它解决了某些解析器包缺少内置类型声明的问题，确保 TypeScript 编译器能够正确识别和检查这些模块的导入和使用。

## Design

### 核心模式

1. **模块声明模式（Module Declaration Pattern）**
   - 使用 `.d.ts` 文件为 JavaScript 模块提供类型定义
   - 采用 `declare module 'package-name'` 语法扩展 TypeScript 模块系统
   - 为编译时类型检查提供支持，而不影响运行时行为

2. **类型桥接（Type Bridging）**
   - 连接 JavaScript 解析器包与 TypeScript 类型系统
   - 提供类型安全的导入路径，避免 `any` 类型的使用
   - 支持严格模式下的类型检查（`strict: true`）

### 文件结构

```
src/types/
└── parser-packages.d.ts    # 第三方解析器包的类型声明
```

### 关键类型定义

- **`@hamster-note/pdf-parser`**：PDF 解析器模块，导出 `PdfParser` 组件
- 其他解析器包（`document-parser`、`html-parser`、`image-parser`、`txt-parser`）通常自带类型声明，无需在此目录定义

## Flow

### 数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                    编译时类型检查                              │
│                                                             │
│  ┌─────────────┐      ┌──────────────┐      ┌────────────┐ │
│  │ main.ts     │ ───► │ types/       │ ───► │ TypeScript │ │
│  │ (导入解析器) │      │ parser-      │      │ 编译器     │ │
│  │             │      │ packages.d.ts│      │            │ │
│  └─────────────┘      └──────────────┘      └────────────┘ │
│         │                                          │       │
│         ▼                                          ▼       │
│  ┌─────────────┐                          ┌────────────┐  │
│  │ conversion/ │                          │ 类型验证    │  │
│  │ adapters.ts │                          │ 通过 ✓     │  │
│  └─────────────┘                          └────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 类型声明流程

1. **声明阶段**：`parser-packages.d.ts` 使用 `declare module` 语法声明模块接口
2. **导入阶段**：`main.ts` 和 `conversion/adapters.ts` 通过标准 `import` 语句导入解析器
3. **类型解析**：TypeScript 编译器查找类型声明，找到 `.d.ts` 文件中的定义
4. **类型验证**：编译器验证导入的使用方式是否符合类型声明
5. **编译输出**：类型声明不影响最终的 JavaScript 输出，仅用于编译时检查

### 关键流程点

- **入口**：`main.ts` 第 4 行 `import * as PdfParser from '@hamster-note/pdf-parser'`
- **类型查找**：TypeScript 按照 `tsconfig.json` 中的配置查找类型
- **模块解析**：`moduleResolution: "bundler"` 配置影响类型查找策略
- **输出**：确保类型安全，防止运行时类型错误

## Integration

### 上游依赖

| 依赖包 | 用途 | 类型来源 |
|--------|------|----------|
| `@hamster-note/pdf-parser` | PDF 文档解析 | 本目录提供（`parser-packages.d.ts`） |
| `@hamster-note/document-parser` | 文档解析 | 包自带类型 |
| `@hamster-note/html-parser` | HTML 解析 | 包自带类型 |
| `@hamster-note/image-parser` | 图片解析 | 包自带类型 |
| `@hamster-note/txt-parser` | 文本解析 | 包自带类型 |
| `@hamster-note/types` | 共享类型定义 | 包自带类型 |

### 下游消费者

| 消费模块 | 使用方式 | 依赖类型 |
|----------|----------|----------|
| `src/main.ts` | 导入所有解析器包，创建解析器运行时 | `PdfParser` 及其他解析器类型 |
| `src/conversion/adapters.ts` | 动态导入解析器，执行格式转换 | `PdfParserModule`、`ImageParserModule` 等 |
| `src/conversion/utils.ts` | 使用共享类型 | `IntermediateDocument` |
| `src/server.ts` | 协议服务器，调用转换功能 | 间接依赖解析器类型 |

### 配置集成

- **TypeScript 配置**：`tsconfig.json` 中的 `include: ["src"]` 确保类型声明被包含
- **模块解析**：`moduleResolution: "bundler"` 配置支持现代打包工具的模块解析
- **严格模式**：`strict: true` 确保类型声明的完整性和准确性

### 扩展点

如果需要为其他解析器包添加类型支持：

1. 在 `src/types/` 目录创建新的 `.d.ts` 文件
2. 使用 `declare module 'package-name'` 语法声明模块接口
3. 定义导出的类型和函数签名
4. 确保 `tsconfig.json` 的 `include` 配置包含该目录

### 注意事项

- 类型声明文件（`.d.ts`）不参与运行时，仅用于编译时类型检查
- `unknown` 类型的使用（如 `export const PdfParser: unknown`）表示类型信息不完整，建议后续完善
- 该目录与 `@hamster-note/types` 包协同工作，后者提供共享的业务类型定义
