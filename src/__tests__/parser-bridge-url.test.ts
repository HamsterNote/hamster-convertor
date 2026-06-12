/**
 * 验证 getParserRuntimeUrl 在不同 BASE_URL 下都能拼出正确的 iframe 入口。
 *
 * 这是 GitHub Pages 子路径部署 (S5-parser-runtime-subpath) 的关键单元测试：
 * - 根部署 BASE_URL=/        -> '/parser-runtime/index.html'
 * - 子路径 BASE_URL=/beta/   -> '/beta/parser-runtime/index.html'
 *
 * 现有实现已经使用 import.meta.env.BASE_URL，本测试用于回归保护，
 * 防止后续重构中把 BASE_URL 写死成 '/'。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getParserRuntimeUrl } from '../lib/parser-bridge/url'

describe('getParserRuntimeUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('在默认根部署下指向 /parser-runtime/index.html', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(getParserRuntimeUrl()).toBe('/parser-runtime/index.html')
  })

  it('在 /beta/ 子路径部署下指向 /beta/parser-runtime/index.html', () => {
    vi.stubEnv('BASE_URL', '/beta/')
    expect(getParserRuntimeUrl()).toBe('/beta/parser-runtime/index.html')
  })
})
