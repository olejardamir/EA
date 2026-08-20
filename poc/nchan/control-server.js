#!/usr/bin/env node
"use strict"
const http = require("http")
const { execFile } = require("child_process")
const PORT = parseInt(process.env.CONTROL_PORT || "18888", 10)
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/restart") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("restarting\n")
    setTimeout(() => {
      execFile("/bin/bash", ["/usr/local/bin/nchan-restart.sh"], (err) => {
        if (err) process.stderr.write(`restart error: ${err.message}\n`)
      })
    }, 100)
  } else if (req.method === "GET" && req.url === "/healthcheck") {
    res.writeHead(200, { "Content-Type": "text/plain" })
    res.end("ok")
  } else {
    res.writeHead(404)
    res.end("not found")
  }
})
server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`control server listening on ${PORT}\n`)
})
