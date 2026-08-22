FROM golang:1.24-bookworm AS build
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . ./
ARG GIT_COMMIT_SHA
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/loadgen ./cmd/loadgen

FROM debian:bookworm-slim
COPY --from=build /out/loadgen /usr/local/bin/loadgen
ENTRYPOINT ["/usr/local/bin/loadgen"]
