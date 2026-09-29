import { fileURLToPath } from "node:url"

import type { Tool } from "../core/types"

async function captureTail(stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  let output = ""

  for await (const chunk of stream) {
    output = (output + decoder.decode(chunk, { stream: true }))
      .slice(-32_768)
  }
  return (output + decoder.decode()).slice(-32_768)
}

const shell: Tool = {
  name: "shell",
  description: "Run a Bash command in the project directory (120 second timeout).",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string" },
    },
    required: ["command"],
    additionalProperties: false,
  },
  async execute(input) {
    const command: unknown = JSON.parse(input).command
    if (typeof command !== "string") throw new Error("Invalid command")

    const subprocess = Bun.spawn(["bash", "-lc", `exec 2>&1\n${command}`], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      detached: true,
      stdout: "pipe",
      stderr: "ignore",
    })
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-subprocess.pid, "SIGKILL")
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
      }
    }, 120_000)

    try {
      const [output, exitCode] = await Promise.all([
        captureTail(subprocess.stdout),
        subprocess.exited,
      ])

      return [
        output,
        timedOut ? "command timed out after 120 seconds" : `exit code: ${exitCode}`,
      ].filter(Boolean).join("\n")
    } finally {
      clearTimeout(timeout)
    }
  },
}

export default shell
