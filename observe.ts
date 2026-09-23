type Store = typeof import("./core/store")

const store: Store | undefined = await import("./core/store").catch(
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`Database unavailable, snapshot-only mode: ${message}`)
    return undefined
  },
)
const page = Bun.file(new URL("./observe.html", import.meta.url))

function exportRun(db: Store, rootId: string | null) {
  const included = new Set<string>()
  const threads = db.listThreads().filter((thread) => {
    if (!rootId) return true
    if (
      thread.id === rootId
      || (thread.parentId && included.has(thread.parentId))
    ) {
      included.add(thread.id)
      return true
    }
    return false
  })
  const agentIds = new Set(threads.map((thread) => thread.agentId))

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    agents: db.listAgents().filter((agent) => agentIds.has(agent.id)),
    threads: threads.map((thread) => ({
      ...thread,
      items: db.loadThread(thread.id)?.items ?? [],
    })),
  }
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  fetch(request) {
    const url = new URL(request.url)
    const { pathname } = url
    if (pathname === "/") {
      return new Response(page, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }
    if (!pathname.startsWith("/api/")) {
      return new Response("Not found", { status: 404 })
    }
    if (!store) {
      return new Response("No database. Load a snapshot instead.", {
        status: 503,
      })
    }

    if (pathname === "/api/threads") {
      return Response.json({ threads: store.listThreads() })
    }
    if (pathname === "/api/export") {
      const rootId = url.searchParams.get("root")
      const run = exportRun(store, rootId)
      if (rootId && !run.threads.length) {
        return new Response("Thread not found", { status: 404 })
      }
      const date = run.exportedAt.slice(0, 10)
      const name = `turtles-${rootId?.slice(0, 8) ?? "all"}-${date}.json`
      return Response.json(run, {
        headers: { "Content-Disposition": `attachment; filename="${name}"` },
      })
    }
    const match = pathname.match(/^\/api\/threads\/([^/]+)$/)
    if (match) {
      const thread = store.loadThread(decodeURIComponent(match[1]))
      if (!thread) return new Response("Thread not found", { status: 404 })
      return Response.json({ thread, agent: store.loadAgent(thread.agentId) })
    }
    return new Response("Not found", { status: 404 })
  },
})

console.log(`Observer running at ${server.url}`)
