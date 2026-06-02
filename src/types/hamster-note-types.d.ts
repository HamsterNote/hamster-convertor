declare module '@hamster-note/types' {
  export type Number2 = {
    x: number
    y: number
  }

  export type IntermediateDocument = Record<string, unknown> & {
    outline?: unknown
  }
}
