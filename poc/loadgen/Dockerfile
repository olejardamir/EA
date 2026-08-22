FROM golang:1.24-bookworm@sha256:03d4516a0b39d1ed2b19f8dccb48857067e0c2efbf55cfee0d86748deb72c5 AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . ./
ARG GIT_COMMIT_SHA
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/loadgen ./cmd/loadgen

FROM debian:bookworm-slim@sha256:c3a632367ede2d7a4d1ab5cc9a3913f79ff9660f2ae39319fbe4a56a68bdea
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/loadgen /usr/local/bin/loadgen
ENTRYPOINT ["/usr/local/bin/loadgen"]
