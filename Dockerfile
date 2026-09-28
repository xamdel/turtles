FROM oven/bun:1.4.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN install -d -o bun -g bun /app/data \
    && chown -R bun:bun /app/tools \
    && install -m 0755 docker-entrypoint.sh /usr/local/bin/turtles-entrypoint

USER bun

ENTRYPOINT ["turtles-entrypoint"]
CMD ["bun", "run", "observe"]
