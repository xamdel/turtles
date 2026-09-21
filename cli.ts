import { createInterface } from "node:readline"

import { wake } from "./core/run"
import * as store from "./core/store"

const thread = store.createThread({
  agentId: "main",
  items: [],
})
const input = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
})

let eventId = 0
const poll = setInterval(() => {
  for (const row of store.events(thread.id, eventId)) {
    eventId = row.id
    const event = row.event as {
      type: string
      delta?: string
      error?: string
      response?: { output: { type: string }[] }
    }

    if (event.type === "response.output_text.delta") {
      process.stdout.write(event.delta ?? "")
    }
    if (event.type === "response.output_text.done") {
      process.stdout.write("\n")
    }
    if (
      event.type === "response.completed"
      && !event.response?.output.some((item) => item.type === "function_call")
    ) input.prompt()
    if (event.type === "run.error") {
      console.error(`Error: ${event.error}`)
      input.prompt()
    }
  }
}, 25)

console.log(`Thread ${thread.id}`)
input.prompt()
input.on("line", (content) => {
  if (!content.trim()) return input.prompt()

  store.send(thread.id, {
    type: "message",
    role: "user",
    content,
  })
  wake(thread.id)
})
input.on("close", () => clearInterval(poll))
