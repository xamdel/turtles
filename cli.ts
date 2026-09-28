import { createInterface } from "node:readline"

import { control, running, wake } from "./core/run"
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

let approval: (typeof control.queue)[number] | undefined

function promptNext() {
  approval = control.queue.shift()
  if (approval) {
    console.log(
      `\n${approval.agent.id} [${approval.thread.id.slice(0, 8)}] ${approval.call.name}\n${approval.call.arguments}`,
    )
  }
  input.setPrompt(approval ? "approve? [y/n] " : "> ")
  input.prompt()
}

const { stdout } = process
let statusText = ""

function status() {
  const text = `${control.mode} · ${running.size} running`
  if (text === statusText) return
  statusText = text
  stdout.write(`\x1b7\x1b[${stdout.rows};1H\x1b[2K\x1b[90m${text}\x1b[0m\x1b8`)
}

function layout() {
  stdout.write(`\x1b[1;${stdout.rows - 1}r\x1b[${stdout.rows - 1};1H`)
  statusText = ""
  status()
}

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
  if (!approval && control.queue.length) promptNext()
  status()
}, 100)

stdout.write("\n".repeat(stdout.rows))
layout()
console.log(`Thread ${thread.id}`)
input.prompt()
stdout.on("resize", () => {
  layout()
  input.prompt(true)
})
input.on("line", (content) => {
  const text = content.trim()
  if (text === "/auto" || text === "/manual") {
    control.mode = text.slice(1) as typeof control.mode
    if (control.mode === "manual") return input.prompt()
    for (const item of [approval, ...control.queue.splice(0)]) item?.resolve(true)
    return promptNext()
  }
  if (approval) {
    if (text !== "y" && text !== "n") return input.prompt()
    approval.resolve(text === "y")
    return promptNext()
  }
  if (!text) return input.prompt()

  store.send(thread.id, {
    type: "message",
    role: "user",
    content,
  })
  wake(thread.id)
})
input.on("SIGINT", () => input.close())
input.on("close", () => {
  clearInterval(poll)
  stdout.write(`\x1b[r\x1b[${stdout.rows};1H\x1b[2K`)
  process.exit()
})
