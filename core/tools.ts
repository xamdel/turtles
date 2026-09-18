import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

import type { Tool } from "./types"

export function listTools() {
  return readdirSync(new URL("../tools/", import.meta.url))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.slice(0, -3))
    .sort()
}

export function resolveTools(names: readonly string[]) {
  return names.map((name) => {
    const path = fileURLToPath(new URL(`../tools/${name}.ts`, import.meta.url))
    delete require.cache[path]

    const tool = (require(path) as { default: Tool }).default
    if (
      tool?.name !== name
      || !tool.parameters || typeof tool.parameters !== "object"
      || Array.isArray(tool.parameters)
      || typeof tool.execute !== "function"
    ) throw new Error(`Invalid tool: ${name}`)

    return tool
  })
}
