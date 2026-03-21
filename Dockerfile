# Build Stage
FROM node:22-slim AS build

WORKDIR /app

# Dependency files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production Stage
FROM node:22-slim

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --omit=dev

# Copy the built files from the build stage
COPY --from=build /app/dist ./dist
# Copy the server file to serve the static content
COPY --from=build /app/server.ts ./server.ts

# Set environment variables
ENV NODE_ENV=production
ENV PORT=2017

# Expose the port
EXPOSE 2017

# Start the application using Node's native TypeScript support (Node 22+)
CMD ["node", "--experimental-strip-types", "server.ts"]