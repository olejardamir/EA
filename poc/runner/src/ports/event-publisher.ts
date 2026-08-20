export interface EventPublisher {
  publish(channel: string, body: string, eventType: string): Promise<boolean>
  healthcheck(): Promise<boolean>
}
