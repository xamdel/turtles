import config from "../config.json"
import { wake } from "../core/run"
import { createThread, listAgents } from "../core/store"
import { listTools } from "../core/tools"
import type { Tool } from "../core/types"

const dispatch: Tool = {
  name: "dispatch",
  description:
    "Dispatch a task to a specialized agent. Returns immediately; the result arrives as a message when the work completes.",
  parameters: {
    type: "object",
    properties: {
      task: { type: "string" },
    },
    required: ["task"],
    additionalProperties: false,
  },
  execute(input, { threadId }) {
    const task: unknown = JSON.parse(input).task
    if (typeof task !== "string") throw new Error("Invalid task")

    const taskId = crypto.randomUUID()
    const agents = listAgents().map(({ id, description }) => ({ id, description }))
    const models = Object.entries(config.models)
      .map(([id, { description }]) => ({ id, description }))
    const thread = createThread({
      parentId: threadId,
      taskId,
      agentId: "builder",
      items: [
        {
          type: "message",
          role: "developer",
          content: [
            `Agents:\n${JSON.stringify(agents, null, 2)}`,
            `Tools:\n${JSON.stringify(listTools())}`,
            `Models:\n${JSON.stringify(models, null, 2)}`,
          ].join("\n\n"),
        },
        { type: "message", role: "user", content: task },
      ],
    })
    wake(thread.id)
    return `Dispatched task ${taskId}.`
  },
}

export default dispatch
