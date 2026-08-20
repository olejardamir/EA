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
