import '@testing-library/jest-dom/vitest'

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement
) {
  return null
} as HTMLCanvasElement['getContext']

const originalWarn = console.warn
console.warn = (...args: unknown[]) => {
  if (args.length > 0 && typeof args[0] === 'string') {
    const message = args[0]
    if (
      message.includes('standardFontDataUrl') ||
      message.includes('Indexing all PDF objects')
    ) {
      return
    }
  }
  originalWarn(...args)
}
