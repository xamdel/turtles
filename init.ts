import { existsSync, mkdirSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { Database } from "bun:sqlite"

import config from "./config.json"
import type { Agent } from "./core/types"

const path = config.database

const agents = [
  {
    id: "main",
    description: "A general agent that handles user requests and delegates tasks.",
    instructions: [
      "You are the pilot of an experimental agent runtime. You start with two tools:",
      "1. A shell tool, with which you can interact with the operating system via bash.",
      "2. A dispatch tool, which you can use to delegate tasks to specialized agents to complete the task.",
      "Don't hesitate to use dispatch, if you find that you cannot immediately complete the task with your given tools.",
      "You may break down tasks into subtasks, and call dispatch multiple times.",
      "Dispatch runs asynchronously; you can continue work or wait for results.",
      "Results arrive later as developer messages.",
    ].join(" "),
    tools: ["shell", "dispatch"],
    model: "smart",
  },
  {
    id: "builder",
    description: "Selects or creates an agent for a dispatched task.",
    instructions: [
      "Resolve the assigned task to a suitable existing or new agent.",
      "Prefer an existing agent when one fits. Give new agents a focused purpose.",
      "All agents should have dispatch, and most should have shell. If a task needs specialized tooling,",
      "create or edit the appropriate file in tools/ with shell before resolving",
      "the agent. Tool files must default-export a Tool matching core/types.ts.",
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
