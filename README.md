A minimalist, recursive, natively asynchronous agent runtime.

All agents get a `dispatch` tool by default, allowing them to distribute tasks to new agents while continuing their own work. If a suitable agent does not already exist for the task, the `builder` agent will create one, along with the necessary tools. Agents will probably call this forever and never actually accomplish anything.

> *It's turtles all the way down!*
