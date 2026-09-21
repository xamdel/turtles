import OpenAI from "openai"
import type { ResponseInputItem } from "openai/resources/responses/responses"

import config from "../config.json"
import { log } from "./store"
import type { Agent, Thread, Tool } from "./types"

const apiKey = process.env.API_KEY
const baseURL = process.env.BASE_URL
if (!apiKey) throw new Error("API_KEY is not set")
if (!baseURL) throw new Error("BASE_URL is not set")

const client = new OpenAI({
  baseURL,
  apiKey,
  maxRetries: 0,
})

export function infer(agent: Agent, thread: Thread, tools: readonly Tool[]) {
  const request = {
    model: config.models[agent.model as keyof typeof config.models].model,
    instructions: agent.instructions,
    input: thread.items as ResponseInputItem[],
    tools: tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    })),
    store: false,
    stream: true as const,
  }

  log(thread.id, {
    type: "inference.request",
    request,
  })

  return client.responses.create(request)
}
