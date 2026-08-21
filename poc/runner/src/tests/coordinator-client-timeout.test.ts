import { describe, it } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { requestJson } from "../application/coordinator-client.js"

async function delayedServer(delayMs: number): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_request, response) => {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "application/json" })
      response.end('{"released":true}')
    }, delayMs)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("test server has no TCP address")
  return {
    url: `http://127.0.0.1:${address.port}/barrier`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

describe("coordinator client barrier deadline", () => {
  it("accepts a deliberately delayed barrier inside the explicit deadline", async () => {
    const server = await delayedServer(80)
    try {
      const result = await requestJson<{ released: boolean }>(server.url, { method: "POST", body: "{}" }, 500)
      assert.equal(result.released, true)
    } finally {
      await server.close()
    }
  })

  it("fails explicitly at the configured deadline without retrying", async () => {
    const server = await delayedServer(200)
    try {
      await assert.rejects(requestJson(server.url, { method: "POST", body: "{}" }, 20), /request timeout after 20ms/)
    } finally {
      await server.close()
    }
  })
})
