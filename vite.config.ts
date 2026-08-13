import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// pdf-parser 标准字体文件路径（开发模式用）
const pdfParserStandardFontsPath = path.resolve(
  __dirname,
  'node_modules/@hamster-note/pdf-parser/dist/standard_fonts'
)

// 条件化别名：仅在本地开发时且路径存在时使用 sibling 目录
// 解析器别名已移至 packages/parser-runtime/vite.config.ts
const localDevAlias: Record<string, string> = {}
const typesPath = path.resolve(__dirname, '../types/src/index.ts')
const parserRuntimeIndexPath = path.resolve(__dirname, 'packages/parser-runtime/index.html')
const pdfParserStandardFontsExpression = 'new URL("./standard_fonts/", import.meta.url).href'

if (existsSync(typesPath)) {
  localDevAlias['@hamster-note/types'] = typesPath
}

const normalizeBasePath = (base: string): string => {
  if (base === '' || base === './') {
    return '/'
  }

  return `/${base}/`.replace(/\/+/g, '/')
}

const stripBasePath = (requestPath: string, basePath: string): string => {
  if (basePath === '/') {
    return requestPath
  }

  const basePrefix = basePath.replace(/\/$/, '')
  if (requestPath === basePrefix) {
    return '/'
  }

  if (requestPath.startsWith(`${basePrefix}/`)) {
    return requestPath.slice(basePrefix.length)
  }

  return requestPath
}

// 拦截 pdf-parser 中的 import("pdfjs-dist") 调用，替换为 runtime 内部包装模块
// 解决中文乱码问题：pdf.js 需要 CMap 数据才能正确解码 CJK 文本
const interceptPdfjsImportPlugin = (): Plugin => ({
  name: 'intercept-pdfjs-import',
  enforce: 'pre',
  transform(code, id) {
    const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
    const isRuntimeModule = id.includes('packages/parser-runtime/src/conversion/adapters')
    const pdfjsImportPattern = /import\((['"])pdfjs-dist\1\)/
    const needsIntercept = (isPdfParserModule || isRuntimeModule) && pdfjsImportPattern.test(code)
    if (!needsIntercept) {
      return null
    }

    const modifiedCode = code.replace(
      pdfjsImportPattern,
      'import("/packages/parser-runtime/src/lib/pdfjs-wrapper.ts")'
    )

    return {
      code: modifiedCode,
      map: null
    }
  }
})

const ensurePdfParserStandardFontUrlPlugin = (): Plugin => ({
  name: 'ensure-pdf-parser-standard-font-url',
  enforce: 'pre',
  transform(code, id) {
    const isPdfParserModule = id.includes('@hamster-note/pdf-parser') || id.includes('/PdfParser/')
    if (!isPdfParserModule || !code.includes(pdfParserStandardFontsExpression)) {
      return null
    }

    return {
      code: code.replaceAll(
        pdfParserStandardFontsExpression,
        `${pdfParserStandardFontsExpression}.replace(/\\/?$/, '/')`
      ),
      map: null
    }
  }
})

// 解析器运行时开发服务器：为 /parser-runtime 路径提供 dev server 支持
const parserRuntimeDevServerPlugin = (): Plugin => ({
  name: 'parser-runtime-dev-server',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const [requestPath = '', queryString] = req.url?.split('?') ?? []
      const basePath = normalizeBasePath(server.config.base)
      const runtimeBasePath = `${basePath}parser-runtime/`.replace(/\/+/g, '/')
      const runtimePath = stripBasePath(requestPath, basePath)

      // 提供 pdf-parser 标准字体文件的静态访问（开发模式）
      if (runtimePath.includes('standard_fonts') && existsSync(pdfParserStandardFontsPath)) {
        const fontName = path.basename(runtimePath)
        const fontPath = path.join(pdfParserStandardFontsPath, fontName)
        if (existsSync(fontPath)) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/octet-stream')
          res.end(readFileSync(fontPath))
          return
        }
      }

      if (runtimePath === '/parser-runtime') {
        res.statusCode = 302
        res.setHeader('Location', `${runtimeBasePath}index.html`)
        res.end()
        return
      }

      if (runtimePath === '/parser-runtime/index.html') {
        try {
          // 开发模式下直接使用 packages 目录的源码路径，避免 Vite 预转换解析失败
          const html = readFileSync(parserRuntimeIndexPath, 'utf8').replace(
            'src="/src/main.ts"',
            `src="${basePath}packages/parser-runtime/src/main.ts"`
          )
          const transformedHtml = await server.transformIndexHtml(
            `${runtimeBasePath}index.html`,
            html
          )

          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html')
          res.end(transformedHtml)
        } catch (error) {
          next(error as Error)
        }
        return
      }

      if (runtimePath.startsWith('/parser-runtime/src/')) {
        const rewrittenPath = runtimePath.replace(
          '/parser-runtime/src/',
          '/packages/parser-runtime/src/'
        )
        req.url = queryString == null ? rewrittenPath : `${rewrittenPath}?${queryString}`
      }

      next()
    })
  }
})

// 通过 BASE_PATH 环境变量切换部署根路径：
// - 默认根部署：BASE_PATH 未设置 → '/'，资源指向 /assets/...
// - GitHub Pages beta 子路径部署：BASE_PATH=/beta/ → '/beta/'，资源指向 /beta/assets/...
// 一定保证以 '/' 开头并以 '/' 结尾，否则 Vite 输出的资源路径会拼接出错。
const resolveBasePath = (): string => {
  const raw = process.env.BASE_PATH
  if (!raw || raw === '/') {
    return '/'
  }
  // 容错处理：用户可能传 'beta' / '/beta' / 'beta/' 等，统一规范成 '/beta/'
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  return withTrailing.replace(/\/+/g, '/')
}

const basePath = resolveBasePath()

// https://vitejs.dev/config/
export default defineConfig({
  base: basePath,
  plugins: [
    interceptPdfjsImportPlugin(),
    ensurePdfParserStandardFontUrlPlugin(),
    parserRuntimeDevServerPlugin(),
    react()
  ],
  resolve: {
    alias: {
      ...localDevAlias,
      // 开发模式下解析 parser-runtime 的源码路径
      '/parser-runtime/src/': path.resolve(__dirname, 'packages/parser-runtime/src/')
    }
  },
  server: {
    port: 5073,
    host: '0.0.0.0'
  },
  preview: {
    port: 5073
  },
  optimizeDeps: {
    exclude: ['@hamster-note/pdf-parser']
  },
  build: {
    emptyOutDir: false
  }
})
