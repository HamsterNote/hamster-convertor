export function getParserRuntimeUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}parser-runtime/index.html`.replace(/\/+/g, '/')
}
