#!/bin/sh
set -eu

bun run db:prepare

exec "$@"
