Turtles is a minimalist, recursive, natively asynchronous agent runtime. It is meant to be used as a foundation for an agent framework that builds itself over time.

All agents get a `dispatch` tool, allowing them to distribute tasks to new agents while continuing their own work. If an agent suitable to the task does not already exist, the `builder` agent will create one, along with the necessary tools. Agents will probably call this forever and never actually accomplish anything.

*It's turtles all the way down!*


> [!WARNING]
> Experimental. Agents have shell access in the installed environment. There is currently no depth control for dispatch calls. Do not give turtles access to valuable data or unrestricted API keys.

## Quickstart

Requires [Bun](https://bun.sh) and Docker.

```sh
cp .env.example .env                  # API_KEY and BASE_URL for any OpenAI-compatible API
cp config.example.json config.json    # model identifiers
bun run turtles                       # build, start sandboxed in Docker, open the CLI
```

The observer UI is at http://localhost:3000. 

`bun run down` stops everything. To wipe data and start fresh, add `-v`
