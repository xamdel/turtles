import config from "../config.json"
import { wake } from "../core/run"
import { handoffThread, loadAgent, loadThread } from "../core/store"
import { resolveTools } from "../core/tools"
import type { Agent, Tool } from "../core/types"

function parseDefinition(value: unknown): Agent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid agent definition")
  }

  const { id, description, instructions, tools, model } =
    value as Record<string, unknown>
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
    "Resolve this task to an existing agent or a new agent definition. A successful resolution starts the selected agent and completes your work.",
  parameters: {
    type: "object",
    properties: {
      agent: {
        oneOf: [
          {
            type: "string",
            description: "The id of an existing agent.",
          },
          {
            type: "object",
            description: "The complete definition of a new agent.",
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              instructions: { type: "string" },
              tools: { type: "array", items: { type: "string" } },
              model: {
                type: "string",
                description: "An id from the available model catalog.",
              },
            },
            required: ["id", "description", "instructions", "tools", "model"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["agent"],
    additionalProperties: false,
  },
  execute(input, { threadId }) {
    const choice: unknown = JSON.parse(input).agent

    const caller = loadThread(threadId)
    if (!caller) throw new Error(`Thread not found: ${threadId}`)

    const task = caller.items.find((item) =>
      item.type === "message" && item.role === "user"
    )
    if (!task) throw new Error(`Task not found: ${caller.taskId ?? threadId}`)

    const creating = typeof choice !== "string"
    const agent = creating ? parseDefinition(choice) : loadAgent(choice)
    if (!agent) throw new Error(`Agent not found: ${choice}`)
    if (!Object.hasOwn(config.models, agent.model)) {
      throw new Error(`Model not found: ${agent.model}`)
    }

    resolveTools(agent.tools)

    const thread = handoffThread(
      threadId,
      creating ? agent : agent.id,
      [task],
    )
    wake(thread.id)
    return `Resolved task ${thread.taskId} to agent ${thread.agentId}.`
  },
}

export default resolveAgent
