import { fileURLToPath } from "node:url"

import type { Tool } from "../core/types"

const shell: Tool = {
  name: "shell",
  description: "Run a Bash command in the project directory.",
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

    const process = Bun.spawn(["bash", "-lc", command], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ])

    return [
      stdout.trimEnd(),
      stderr && `stderr:\n${stderr.trimEnd()}`,
      `exit code: ${exitCode}`,
    ].filter(Boolean).join("\n")
  },
}

export default shell
