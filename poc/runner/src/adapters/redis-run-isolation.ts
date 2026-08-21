import net from "node:net"

function redisCommand(redisUrl: string, command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(redisUrl)
    const socket = net.createConnection({ host: url.hostname, port: parseInt(url.port || "6379", 10) })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Redis ${command} timeout`))
    }, 5000)
    let response = ""
    socket.on("connect", () => socket.write(`*1\r\n$${command.length}\r\n${command}\r\n`))
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8")
      if (!response.endsWith("\r\n")) return
      clearTimeout(timeout)
      socket.destroy()
      resolve(response.trim())
    })
    socket.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

export async function resetRedisForExperiment(redisUrl: string): Promise<void> {
  const flushed = await redisCommand(redisUrl, "FLUSHALL")
  if (flushed !== "+OK") throw new Error(`Redis FLUSHALL failed: ${flushed}`)
  const size = await redisCommand(redisUrl, "DBSIZE")
  if (size !== ":0") throw new Error(`Redis run isolation failed: DBSIZE returned ${size}`)
}

// v2.1.0: multibulk RESP command with arbitrary arguments (SET/GET for cross-shard
// expectation handoff). Single connection per call; response parsed from RESP types.
function redisCommandArgs(redisUrl: string, args: string[], timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(redisUrl)
    const socket = net.createConnection({ host: url.hostname, port: parseInt(url.port || "6379", 10) })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Redis ${args[0]} timeout`))
    }, timeoutMs)
    let payload = `*${args.length}\r\n`
    for (const arg of args) payload += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`
    let response = ""
    socket.on("connect", () => socket.write(payload))
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8")
      // A complete RESP reply ends with CRLF; bulk strings may contain CRLF only in
      // the payload body which is length-prefixed — for our small JSON values a
      // trailing-CRLF check plus prefix inspection is sufficient.
      if (!response.endsWith("\r\n")) return
      clearTimeout(timeout)
      socket.destroy()
      resolve(response)
    })
    socket.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}

export async function redisSet(redisUrl: string, key: string, value: string): Promise<void> {
  const response = await redisCommandArgs(redisUrl, ["SET", key, value])
  if (!response.startsWith("+OK")) throw new Error(`Redis SET failed: ${response.trim()}`)
}

export async function redisGet(redisUrl: string, key: string): Promise<string | null> {
  const response = await redisCommandArgs(redisUrl, ["GET", key])
  if (response.startsWith("$-1")) return null
  if (!response.startsWith("$")) throw new Error(`Redis GET failed: ${response.trim()}`)
  const firstCrlf = response.indexOf("\r\n")
  const declaredLength = parseInt(response.slice(1, firstCrlf), 10)
  if (!Number.isInteger(declaredLength) || declaredLength < 0) {
    throw new Error(`Redis GET malformed bulk header: ${response.trim().slice(0, 64)}`)
  }
  const body = response.slice(firstCrlf + 2)
  if (body.length < declaredLength) throw new Error(`Redis GET truncated body`)
  return body.slice(0, declaredLength)
}
