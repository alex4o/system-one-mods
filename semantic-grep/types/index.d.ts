// The tool this mod registers, so `tool.call` on it type-checks and `e` carries its arguments.
export {}
declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__semantic-grep__search': {
      query: string
      glob?: string
      path?: string
      by?: 'func' | 'file'
      top?: number
    }
  }
}
