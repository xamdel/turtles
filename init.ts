import { existsSync, mkdirSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"

import config from "./config.json"
import type { Agent } from "./core/types"

const path = config.database

const agents = [
  {
    id: "main",
    description: "The main agent.",
    instructions: [
      "You are the pilot of an experimental agent runtime. Your primary job is to interface with the human user.",
      "Always speak in a natural conversational style: mostly short turns, only speaking at length when appropriate.",
      "Ask questions to build context and clarify user intent.",
      "Be proactive in your interaction style, anticipating and uncovering needs.",
      "Use the dispatch tool to accomplish tasks for the user: enter a natural language prompt, and an agent will complete the task for you and return the result.",
      "Individual dispatches may remain relatively complex: if a specialized agent for the task does not exist, one or more agents will be created to complete the task. In other words, your concern is *what* gets done, not *how* it is accomplished.",
      "Dispatch can be called in parallel. Use this only for work that would benefit from parallelization.",
      "Dispatch runs asynchronously, and the result of the task is delivered to you when work is completed. Use this as a breakpoint to direct multi-step initiatives that may involve multiple decision points.",
      "You should continue interfacing with the user while dispatched work is being done, unless it is appropriate to wait.",
    ].join(" "),
    tools: ["dispatch"],
    model: "smart",
  },
  {
    id: "builder",
    description: "Answers dispatch. Selects or creates agents and tools.",
    instructions: [
      "Fulfill the requested task. Only perform work yourself if the task is simple *and* ephemeral: if the task will need to be done again in the future, or if it would benefit from specialization, call resolve_agent instead.",
      "Use your shell tool to write executable tool files into the tools/ directory for operations that agents will need to repeat. Tool files must default-export a Tool matching core/types.ts.",
      "You may also use your shell tool to gather necessary context that will aid you in selecting or creating agents or tools.",
      "Use resolve_agent to select an existing agent or create a new one. If new tools are required, create them with the shell tool before resolving the agent.",
      "Prefer an existing agent when one already fits.",
      "Give new agents a focused purpose and the minimum tools they need: always dispatch, plus shell when they must touch files or the network.",
      "Tell new agents, in their instructions, that they may dispatch sub-agents for parallel or specialized work, or sub-tasks that their main task requires. Encourage them to use it when the work would benefit from being subdivided.",
    ].join(" "),
    tools: ["shell", "resolve_agent"],
    model: "smart",
  },
] satisfies readonly Agent[]

const schema = `
  CREATE TABLE events (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX events_thread ON events(thread_id, id);

  CREATE TABLE agents (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );

  CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    parent_id TEXT,
    task_id TEXT,
    agent_id TEXT NOT NULL
  );

  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX items_thread ON items(thread_id, id);

  CREATE TABLE mail (
    id INTEGER PRIMARY KEY,
    thread_id TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX mail_thread ON mail(thread_id, id);

  CREATE TABLE pending (
    parent_id TEXT NOT NULL,
    task_thread_id TEXT NOT NULL,
    PRIMARY KEY (parent_id, task_thread_id)
  );

  PRAGMA user_version = 1;
`

export function initialize() {
  if (existsSync(path)) throw new Error(`Database already exists at ${path}`)

  mkdirSync(dirname(path), { recursive: true })
  const database = new Database(path, { create: true })

  try {
    database.exec("PRAGMA journal_mode = WAL")
    database.transaction(() => {
      database.exec(schema)
      const insert = database.prepare(
        "INSERT INTO agents (id, data) VALUES (?, ?)",
      )
      for (const agent of agents) insert.run(agent.id, JSON.stringify(agent))
    }).immediate()
  } catch (error) {
    database.close()
    unlinkSync(path)
    throw error
  }

  database.close()
  console.log(`Initialized database at ${path}`)
}

if (import.meta.main) initialize()

