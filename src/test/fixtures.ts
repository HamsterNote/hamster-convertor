import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const currentDir = dirname(fileURLToPath(import.meta.url))

export const loadPdfFixture = async (name: string): Promise<Uint8Array> => {
  const fixturePath = join(currentDir, 'fixtures', name)
  const buffer = await readFile(fixturePath)
  return new Uint8Array(buffer)
}

export const loadHtmlFixture = async (name: string): Promise<string> => {
  const fixturePath = join(currentDir, 'fixtures', name)
  const buffer = await readFile(fixturePath)
  return buffer.toString('utf-8')
}
