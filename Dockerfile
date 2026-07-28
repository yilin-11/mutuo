# Debian rather than Alpine: sqlite3 publishes prebuilt binaries for glibc, and
# on musl npm falls back to compiling it, which needs a toolchain this image has
# no other reason to carry.
FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, as their own layer, so a code change does not reinstall
# them. npm ci installs exactly what package-lock.json pins.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# The node image ships a non-root `node` user. Run as it: nothing here needs to
# write outside the app directory, and a container process that cannot become
# root is one less thing to think about.
RUN chown -R node:node /app
USER node

EXPOSE 8080

# server.js exits non-zero when the database is unreachable, so the platform's
# own restart policy is enough — no wrapper script.
CMD ["node", "server.js"]
