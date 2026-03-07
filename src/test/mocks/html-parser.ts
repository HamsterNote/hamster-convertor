import type { IntermediateDocument } from '@hamster-note/types'

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
  </head>
  <body>
    <style>
      .hamster-note-document { position: relative; display: block; contain: layout style size; }
      .hamster-note-document .hamster-note-page { position: relative; overflow: hidden; background-repeat: no-repeat; background-position: top center; background-size: contain; }
      .hamster-note-document .hamster-note-text { position: absolute; white-space: pre; transform-origin: 0 0; }
    </style>
    <div class="hamster-note-document">Hamster PDF Sample</div>
  </body>
</html>
`

export class HtmlParser {
  static readonly exts = ['html'] as const

  static async decodeToHtml(_intermediateDocument: IntermediateDocument): Promise<string> {
    return html
  }
}
