import * as store from "./core/store"

const page = Bun.file(new URL("./observe.html", import.meta.url))
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === "/api/threads") {
      return Response.json({ threads: store.listThreads() })
    }
    if (pathname === "/") {
      return new Response(page, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    }
    return new Response("Not found", { status: 404 })
  },
})

console.log(`Observer running at ${server.url}`)
