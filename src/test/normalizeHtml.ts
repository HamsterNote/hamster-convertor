import { load } from 'cheerio'

export type NormalizedHtml = {
  html: string
  text: string
}

const compactWhitespace = (value: string) =>
  value.replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()

const stripDynamicAttributes = (value: string) =>
  value.replace(/\s(?:data-)?id="[^"]*"/gi, '')

export const normalizeHtml = (html: string): NormalizedHtml => {
  const $ = load(html)
  const bodyText = compactWhitespace($('body').text())
  const cleanedHtml = stripDynamicAttributes(compactWhitespace($.html()))

  return {
    html: cleanedHtml,
    text: bodyText
  }
}
