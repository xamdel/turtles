import { infer } from "./inference"
import * as store from "./store"
import { resolveTools } from "./tools"
import type { Agent, Item, Thread, Tool, ToolCall } from "./types"

const running = new Set<string>()

export function wake(threadId: string) {
  void run(threadId).then((outcome) => {
    if (!outcome?.thread.parentId) return

    const taskId = outcome.thread.taskId ?? threadId
    const delivered = store.deliverResult(outcome.thread.parentId, threadId, {
      type: "message",
      role: "developer",
      content: `Result for task ${taskId}:\n\n${outcome.report}`,
    })
    if (delivered) wake(outcome.thread.parentId)
  })
}

async function step(
  agent: Agent,
  thread: Thread,
  tools: readonly Tool[],
) {
  store.receive(thread)

  const stream = await infer(agent, thread, tools)
  let output: Item[] | undefined
  let report = ""

  for await (const event of stream) {
    store.log(thread.id, event)

    if (event.type === "response.output_text.done") report += event.text

    if (event.type === "response.completed") {
      output = event.response.output as Item[]
      store.appendItems(thread, output)
    }
  }

  if (!output) throw new Error("Inference ended without a completed response")
  const calls = output.filter(
    (item): item is ToolCall => item.type === "function_call",
  )

  for (const call of calls) {
    const tool = tools.find((tool) => tool.name === call.name)
    let result: string

    try {
      if (!tool) throw new Error(`Tool not found: ${call.name}`)
      result = await tool.execute(call.arguments, { threadId: thread.id })
    } catch (error) {
      result = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    const item = {
      type: "function_call_output",
      call_id: call.call_id,
      output: result,
    } as const

    store.appendItems(thread, [item])
    store.log(thread.id, item)
  }

  return { output, report }
}

async function run(
  threadId: string,
): Promise<{ thread: Thread; report: string } | undefined> {
  if (running.has(threadId)) return
  running.add(threadId)
  let thread: Thread | undefined
  let cleanExit = false

  try {
    thread = store.loadThread(threadId)
    if (!thread) throw new Error(`Thread not found: ${threadId}`)

    const agent = store.loadAgent(thread.agentId)
    if (!agent) throw new Error(`Agent not found: ${thread.agentId}`)

    const tools = resolveTools(agent.tools)

    while (true) {
      const { output, report } = await step(agent, thread, tools)

      if (thread.parentId && !store.isPending(thread.parentId, thread.id)) return
      if (output.some((item) => item.type === "function_call")) continue
      if (store.hasMail(threadId)) continue

      cleanExit = true
      if (store.hasPending(threadId)) return

      return { thread, report }
    }
  } catch (error) {
    const report = error instanceof Error ? error.message : String(error)
    store.log(threadId, { type: "run.error", error: report })
    return thread && { thread, report }
  } finally {
    running.delete(threadId)
    if (cleanExit && store.hasMail(threadId)) wake(threadId)
  }
}
