export interface Clock {
  now(): number
  hrtime(): bigint
}
