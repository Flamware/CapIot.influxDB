# Stage 1: Build the Go API
FROM golang:1.24-alpine AS builder

# Set the working directory inside the container
WORKDIR /app

# Copy go.mod and go.sum files
COPY go.mod go.sum ./

# Download Go dependencies
RUN go mod download -x

# Copy the entire project source code
COPY . .

# Build the Go API executable
RUN go build -o CapIot.influxDB ./cmd/api/main.go # Adjust the build command and output name as needed

# Stage 2: Create a minimal runtime image
FROM alpine:latest AS runtime

# Set the working directory
WORKDIR /app

# Copy the built executable from the builder stage
COPY --from=builder /app/capi-influxdb-api .

# Expose the port your API listens on (e.g., 8000)
EXPOSE 8000

# Command to run your Go API
CMD ["./capi-influxdb-api"]