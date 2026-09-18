export type Agent = Readonly<{
  id: string
  description: string
  instructions: string
  tools: readonly string[]
  model: string
}>

export type Thread = Readonly<{
  id: string
  parentId?: string
  taskId?: string
  agentId: string
  items: Item[]
}>

export type Tool = Readonly<{
  name: string
  description?: string
  parameters: Record<string, unknown>
  execute(
    input: string,
    context: Readonly<{ threadId: string }>,
  ): string | Promise<string>
}>

export type Item = Message | Reasoning | ToolCall | ToolResult

export type Message = Readonly<{
  type: "message"
  role: "user" | "assistant" | "system" | "developer"
  content: string | readonly unknown[]
}>

export type Reasoning = Readonly<{
  type: "reasoning"
}>

export type ToolCall = Readonly<{
  type: "function_call"
  call_id: string
  name: string
  arguments: string
}>

export type ToolResult = Readonly<{
  type: "function_call_output"
  call_id: string
  output: string
}>
