# Stage 1: Build the frontend
FROM node:24-alpine AS builder

WORKDIR /app

# Copy dependency configuration and local packages
COPY package*.json ./
COPY server/mock-blobs/ ./server/mock-blobs/

# Install all dependencies (including devDependencies)
RUN npm install

# Copy source code and build config
COPY src/ ./src/
COPY public/ ./public/
COPY index.html ./
COPY vite.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Build the React application
RUN npm run build

# Stage 2: Production runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

# Copy production configurations and the local mock package
COPY package*.json ./
COPY server/mock-blobs/ ./server/mock-blobs/

# Install only production dependencies
RUN npm install --omit=dev

# Copy server code, Netlify function handlers (used by Express), and the built frontend assets
COPY server.mjs ./
COPY netlify/ ./netlify/
COPY --from=builder /app/dist ./dist

# Create a directory for persistent data
RUN mkdir -p /app/data

# Expose production port
EXPOSE 3000

# Define a volume for persistent database/file storage
VOLUME ["/app/data"]

CMD ["npm", "start"]
