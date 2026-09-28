import config from "../config.json"
import { wake } from "../core/run"
import { handoffThread, loadAgent, loadThread } from "../core/store"
import { resolveTools } from "../core/tools"
import type { Agent, Tool } from "../core/types"

function parseDefinition(value: Record<string, unknown>): Agent {
  const { id, description, instructions, tools, model } = value
  if (
    typeof id !== "string" || !id.trim()
    || typeof description !== "string" || !description.trim()
    || typeof instructions !== "string"
    || !Array.isArray(tools)
    || !tools.every((name) => typeof name === "string")
    || typeof model !== "string"
  ) throw new Error("Invalid agent definition")

  return { id, description, instructions, tools, model }
}

const resolveAgent: Tool = {
  name: "resolve_agent",
  description:
    "Resolve this task to an agent: pass only the id of an existing agent, or a complete definition to create or replace an agent. A successful resolution starts the selected agent and completes your work.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "The id of the existing, new, or replacement agent.",
      },
      description: { type: "string" },
      instructions: { type: "string" },
      tools: { type: "array", items: { type: "string" } },
      model: {
        type: "string",
        description: "An id from the available model catalog.",
      },
    },
    required: ["id"],
    additionalProperties: false,
  },
  execute(input, { threadId }) {
    const choice = JSON.parse(input) as Record<string, unknown>
    const defining = Object.keys(choice).length > 1
    const agent = defining ? parseDefinition(choice) : loadAgent(String(choice.id))
    if (!agent) throw new Error(`Agent not found: ${choice.id}`)
    if (!Object.hasOwn(config.models, agent.model)) {
      throw new Error(`Model not found: ${agent.model}`)
    }

    const caller = loadThread(threadId)
    if (!caller) throw new Error(`Thread not found: ${threadId}`)

    const task = caller.items.find((item) =>
      item.type === "message" && item.role === "user"
    )
    if (!task) throw new Error(`Task not found: ${caller.taskId ?? threadId}`)

    resolveTools(agent.tools)

    const thread = handoffThread(
      threadId,
      defining ? agent : agent.id,
      [task],
    )
    wake(thread.id)
    return `Resolved task ${thread.taskId} to agent ${thread.agentId}.`
  },
}

export default resolveAgent
