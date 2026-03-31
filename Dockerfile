FROM node:20-alpine

WORKDIR /app

# Install Python and native build tools required by better-sqlite3 (node-gyp)
RUN apk add --no-cache python3 make g++

# Copy root package files and install root-level dependencies
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# Copy subdirectory package files so npm can install them in place
COPY client/package.json client/package-lock.json* ./client/
COPY server/package.json server/package-lock.json* ./server/

# Copy the full source tree
COPY . .

# Install dependencies in client and server subdirectories
RUN npm run install:all

# Fix execute permissions on all node_modules binaries to prevent
# "Permission denied" errors caused by corrupted cache mounts
RUN find /app/client/node_modules/.bin -type f -exec chmod +x {} + 2>/dev/null || true \
 && find /app/server/node_modules/.bin -type f -exec chmod +x {} + 2>/dev/null || true \
 && find /app/node_modules/.bin -type f -exec chmod +x {} + 2>/dev/null || true

# Build client (tsc + vite build) and server (tsc)
RUN npm run build:client
RUN npm run build:server

CMD ["npm", "start"]
