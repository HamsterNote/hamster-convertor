/**
 * 验证 assetUrl 在不同 BASE_URL 下都能拼出正确的资源路径。
 *
 * 我们手动 stub `import.meta.env.BASE_URL`，模拟两种部署形态：
 * - 默认根部署：BASE_URL = '/'
 * - 子路径 beta 部署：BASE_URL = '/beta/'
 *
 * 这是 GitHub Pages 子路径部署 (S4-subpath-assets) 的关键单元测试。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { assetUrl } from '../lib/assets'

describe('assetUrl', () => {
  afterEach(() => {
    // 恢复 stub，避免污染其他测试
    vi.unstubAllEnvs()
  })

  it('在默认根部署下，前导斜杠的输入会被规范化', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(assetUrl('/logos/hamster_logo.png')).toBe('/logos/hamster_logo.png')
  })

  it('在默认根部署下，没有前导斜杠也能正确拼接', () => {
    vi.stubEnv('BASE_URL', '/')
    expect(assetUrl('logos/hamster_logo.png')).toBe('/logos/hamster_logo.png')
  })

  it('在 /beta/ 子路径部署下，logo 路径会被前缀 /beta/', () => {
    vi.stubEnv('BASE_URL', '/beta/')
    expect(assetUrl('/logos/hamster_logo.png')).toBe('/beta/logos/hamster_logo.png')
    expect(assetUrl('logos/github_icon.png')).toBe('/beta/logos/github_icon.png')
  })

  it('在 /beta/ 子路径部署下，cmaps 目录路径正确', () => {
    vi.stubEnv('BASE_URL', '/beta/')
    expect(assetUrl('cmaps/')).toBe('/beta/cmaps/')
  })
})
