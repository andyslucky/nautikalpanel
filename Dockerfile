# Stage 1: Build the frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source files
COPY frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Build the Rust backend
FROM rust:1.93-alpine3.23 AS backend-builder

# Install build dependencies
RUN apk add --no-cache musl-dev pkg-config openssl-dev

WORKDIR /app

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Create a dummy src/main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies
RUN cargo build --release && rm -rf src

RUN rm -rf ./src
# Copy actual source code
COPY src/ ./src/
COPY game-server-templates/ ./game-server-templates/
COPY k8s-templates/ ./k8s-templates/
COPY templates/ ./templates/

# Build the actual binary
RUN touch src/main.rs && cargo build --release

# Stage 3: Final runtime image
FROM alpine:3.23

# Install runtime dependencies
RUN apk add --no-cache ca-certificates libgcc

WORKDIR /app

# Copy Rust binary from backend-builder
COPY --from=backend-builder /app/target/release/nautikalpanel /app/nautikalpanel

# Copy frontend static files from frontend-builder
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy templates
COPY game-server-templates/ ./game-server-templates/
COPY k8s-templates/ ./k8s-templates/

# Expose port (check your app's port, defaulting to 3000)
EXPOSE 9090

# Run the Rust binary
CMD ["/app/nautikalpanel"]
