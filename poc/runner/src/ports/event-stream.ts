export interface SSEEvent {
  id: string | null
  event: string
  data: string
}

export type SubscriptionEvent =
  | { type: "open" }
  | { type: "message"; event: SSEEvent }
  | { type: "error"; error: Error }

export interface Subscription {
  readonly connected: boolean
  readonly lastEventId: string | null
  onEvent(handler: (event: SubscriptionEvent) => void): void
  // §3.17: Retrieve the currently-registered event handler (for handler chaining in slow-consumer)
  getEventHandler(): ((event: SubscriptionEvent) => void) | null
  // §M3-HVR: Remove a previously-registered handler (used by the slow-consumer replay
  // probe to detach its temporary sequence collector without tearing down the stream).
  removeEventHandler?(handler: (event: SubscriptionEvent) => void): void
  pause(): void
  resume(): void
  close(): void
}

export interface EventStream {
  connect(url: string, lastEventId?: string | null, onParseError?: () => void): Promise<Subscription>
}
