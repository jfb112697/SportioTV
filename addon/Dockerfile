# Purpose: the StreamFree addon image — no build step, no dependencies, so it is a plain copy onto a
# slim Node base. Status: 2026-11-07.

FROM node:22-alpine

# tini reaps the segment-relay children and turns SIGTERM into a clean exit.
RUN apk add --no-cache tini

WORKDIR /app

# No package.json dependencies: `npm ci` would be a no-op and needs a lockfile, so copy the source.
COPY package.json ./
COPY src ./src

ENV NODE_ENV=production \
    PORT=7100 \
    HOST=0.0.0.0

# The service runs unprivileged; node:alpine already ships the `node` user.
USER node

EXPOSE 7100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
