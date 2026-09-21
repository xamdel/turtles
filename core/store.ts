import { existsSync } from "node:fs"
import { Database } from "bun:sqlite"

import config from "../config.json"
import type { Agent, Item, Thread } from "./types"

const path = config.database
if (!existsSync(path)) {
  throw new Error(`Database not initialized at ${path}. Run \`bun run init\`.`)
}
const database = new Database(path, { readwrite: true, create: false })

function transaction<T>(action: () => T): T {
  return database.transaction(action).immediate()
}

const insertEvent = database.prepare(
  "INSERT INTO events (thread_id, timestamp, data) VALUES (?, ?, ?)",
)
const readEvents = database.prepare(
  "SELECT id, data FROM events WHERE thread_id = ? AND id > ? ORDER BY id",
)
const insertThread = database.prepare(
  "INSERT INTO threads (id, parent_id, task_id, agent_id) VALUES (?, ?, ?, ?)",
)
const readThread = database.prepare(
  "SELECT parent_id, task_id, agent_id FROM threads WHERE id = ?",
)
const readThreads = database.prepare(`
  SELECT
    threads.rowid AS sequence,
    threads.id,
    threads.parent_id,
    threads.task_id,
    threads.agent_id,
    EXISTS (
      SELECT 1 FROM pending WHERE task_thread_id = threads.id
    ) AS pending,
    (SELECT COUNT(*) FROM items WHERE thread_id = threads.id) AS item_count,
    (SELECT COUNT(*) FROM events WHERE thread_id = threads.id) AS event_count
  FROM threads ORDER BY threads.rowid
`)
const insertItem = database.prepare(
  "INSERT INTO items (thread_id, data) VALUES (?, ?)",
)
const readItems = database.prepare(
  "SELECT data FROM items WHERE thread_id = ? ORDER BY id",
)
const insertMail = database.prepare(
  "INSERT INTO mail (thread_id, data) VALUES (?, ?)",
)
const readMail = database.prepare(
  "SELECT data FROM mail WHERE thread_id = ? ORDER BY id",
)
const clearMail = database.prepare("DELETE FROM mail WHERE thread_id = ?")
const mailExists = database.prepare(
  "SELECT 1 FROM mail WHERE thread_id = ? LIMIT 1",
)
const insertPending = database.prepare(
  "INSERT INTO pending (parent_id, task_thread_id) VALUES (?, ?)",
)
const removePending = database.prepare(
  "DELETE FROM pending WHERE parent_id = ? AND task_thread_id = ?",
)
const replacePending = database.prepare(`
  UPDATE pending SET task_thread_id = ?
  WHERE parent_id = ? AND task_thread_id = ?
`)
const pendingExists = database.prepare(
  "SELECT 1 FROM pending WHERE parent_id = ? LIMIT 1",
)
const taskPending = database.prepare(
  "SELECT 1 FROM pending WHERE parent_id = ? AND task_thread_id = ? LIMIT 1",
)
const insertAgent = database.prepare(
  "INSERT INTO agents (id, data) VALUES (?, ?)",
)
const readAgent = database.prepare("SELECT data FROM agents WHERE id = ?")
const readAgents = database.prepare("SELECT data FROM agents ORDER BY id")

function insertThreadRows(thread: Thread) {
  insertThread.run(
    thread.id,
    thread.parentId ?? null,
    thread.taskId ?? null,
    thread.agentId,
  )
  for (const item of thread.items) insertItem.run(thread.id, JSON.stringify(item))
}

export function log(threadId: string, event: unknown) {
  insertEvent.run(threadId, Date.now(), JSON.stringify(event))
}

export function events(threadId: string, after = 0) {
  return (readEvents.all(threadId, after) as { id: number; data: string }[])
    .map(({ id, data }) => ({ id, event: JSON.parse(data) as unknown }))
}

export function createThread(input: Omit<Thread, "id">): Thread {
  const thread: Thread = { id: crypto.randomUUID(), ...input }
  transaction(() => {
    insertThreadRows(thread)
    if (thread.parentId) insertPending.run(thread.parentId, thread.id)
  })
  return thread
}

export function handoffThread(
  callerThreadId: string,
  agent: string | Agent,
  items: readonly Item[],
): Thread {
  return transaction(() => {
    const caller = readThread.get(callerThreadId) as {
      parent_id: string | null
      task_id: string | null
    } | null
    if (!caller) throw new Error(`Thread not found: ${callerThreadId}`)
    if (!caller.parent_id || !caller.task_id) {
      throw new Error(`Thread is not a dispatched task: ${callerThreadId}`)
    }

    const agentId = typeof agent === "string" ? agent : agent.id
    if (typeof agent === "string") {
      if (!readAgent.get(agent)) throw new Error(`Agent not found: ${agent}`)
    } else {
      insertAgent.run(agent.id, JSON.stringify(agent))
    }

    const thread: Thread = {
      id: crypto.randomUUID(),
      parentId: caller.parent_id,
      taskId: caller.task_id,
      agentId,
      items: [...items],
    }
    insertThreadRows(thread)
    if (!replacePending.run(
      thread.id,
      caller.parent_id,
      callerThreadId,
    ).changes) {
      throw new Error(`Task is no longer pending: ${caller.task_id}`)
    }
    return thread
  })
}

export function loadThread(threadId: string): Thread | undefined {
  const row = readThread.get(threadId) as {
    parent_id: string | null
    task_id: string | null
    agent_id: string
  } | null
  if (!row) return undefined

  return {
    id: threadId,
    ...(row.parent_id && { parentId: row.parent_id }),
    ...(row.task_id && { taskId: row.task_id }),
    agentId: row.agent_id,
    items: (readItems.all(threadId) as { data: string }[])
      .map(({ data }) => JSON.parse(data) as Item),
  }
}

export function listThreads() {
  const rows = readThreads.all() as {
    sequence: number
    id: string
    parent_id: string | null
    task_id: string | null
    agent_id: string
    pending: number
    item_count: number
    event_count: number
  }[]

  return rows.map((row) => {
    const task = (readItems.all(row.id) as { data: string }[])
      .map(({ data }) => JSON.parse(data) as Item)
      .find((item) => item.type === "message" && item.role === "user")

    return {
      sequence: row.sequence,
      id: row.id,
      parentId: row.parent_id,
      taskId: row.task_id,
      agentId: row.agent_id,
      pending: !!row.pending,
      itemCount: row.item_count,
      eventCount: row.event_count,
      task: task && typeof task.content === "string" ? task.content : undefined,
    }
  })
}

export function appendItems(thread: Thread, items: readonly Item[]) {
  transaction(() => {
    for (const item of items) insertItem.run(thread.id, JSON.stringify(item))
  })
  thread.items.push(...items)
}

export function hasMail(threadId: string) {
  return !!mailExists.get(threadId)
}

export function hasPending(threadId: string) {
  return !!pendingExists.get(threadId)
}

export function isPending(parentId: string, threadId: string) {
  return !!taskPending.get(parentId, threadId)
}

export function send(threadId: string, item: Item) {
  transaction(() => {
    insertMail.run(threadId, JSON.stringify(item))
    log(threadId, { type: "inbox.received", item })
  })
}

export function deliverResult(
  parentId: string,
  taskThreadId: string,
  item: Item,
) {
  return transaction(() => {
    if (!removePending.run(parentId, taskThreadId).changes) return false
    insertMail.run(parentId, JSON.stringify(item))
    log(parentId, { type: "inbox.received", taskThreadId, item })
    return true
  })
}

export function receive(thread: Thread) {
  const items = transaction(() => {
    const rows = readMail.all(thread.id) as { data: string }[]
    const items = rows.map(({ data }) => JSON.parse(data) as Item)
    for (const item of items) insertItem.run(thread.id, JSON.stringify(item))
    clearMail.run(thread.id)
    return items
  })

  thread.items.push(...items)
  return items
}

export function loadAgent(agentId: string) {
  const row = readAgent.get(agentId) as { data: string } | null
  return row ? JSON.parse(row.data) as Agent : undefined
}

export function listAgents() {
  const rows = readAgents.all() as { data: string }[]
  return rows.map(({ data }) => JSON.parse(data) as Agent)
}
