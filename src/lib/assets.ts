/**
 * 静态资源 URL 拼接工具
 *
 * 把以 / 开头的资源相对路径拼到 Vite 的 `import.meta.env.BASE_URL` 上，
 * 让同一份代码能在「根路径 /」和「子路径 /beta/」两种部署下都正确工作。
 *
 * 使用约定：
 * - 调用方传入相对于 `public/` 根的路径，可以带前导 `/`，也可以不带，例如：
 *   - assetUrl('logos/hamster_logo.png')
 *   - assetUrl('/logos/hamster_logo.png')
 * - 返回结果以 BASE_URL 为前缀（默认 '/'，beta 部署下为 '/beta/'）。
 *
 * 不要直接拼绝对路径（例如 `/logos/...`），那样在 `/beta/` 部署下会指向根目录而 404。
 */
export function assetUrl(relPath: string): string {
  // import.meta.env.BASE_URL 在 Vite 构建期由 base 配置决定，运行时是字符串常量。
  // Vite 保证它总是以 '/' 结尾；defaults 是 '/'。
  const base = import.meta.env.BASE_URL || '/'
  // 删除 relPath 的前导斜杠，然后再用 base 拼接，最后压缩可能出现的连续斜杠。
  const trimmed = relPath.replace(/^\/+/, '')
  return `${base}${trimmed}`.replace(/\/+/g, '/')
}
