import type { EventPublisher } from "../ports/event-publisher.js"

export class NchanHttpPublisher implements EventPublisher {
  private pubUrl: string

  constructor(pubUrl: string) {
    this.pubUrl = pubUrl
  }

  async publish(channel: string, body: string, eventType: string): Promise<boolean> {
    try {
      const resp = await fetch(`${this.pubUrl}/pub/${channel}`, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          "X-Event-Source-Event": eventType,
        },
        body,
        signal: AbortSignal.timeout(5000),
      })
      return resp.ok
    } catch {
      return false
    }
  }

  async healthcheck(): Promise<boolean> {
    try {
      const resp = await fetch(`${this.pubUrl}/pub/healthcheck`, { signal: AbortSignal.timeout(3000) })
      return resp.ok
    } catch {
      return false
    }
  }
}
