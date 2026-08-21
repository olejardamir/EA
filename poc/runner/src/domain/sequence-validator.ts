export type SequenceClassification =
  | { kind: "NEXT" }
  | { kind: "DUPLICATE"; seq: number }
  | { kind: "GAP"; expected: number; received: number }
  | { kind: "OUT_OF_ORDER"; expected: number; received: number }

// §M3-GEN: NEXT is the ~100% hot-path outcome; share one frozen instance
// instead of allocating an object per frame. Frozen so any accidental
// mutation throws rather than corrupting shared state.
const NEXT: SequenceClassification = Object.freeze({ kind: "NEXT" })

export interface SequenceTracker {
  readonly lastSeq: number
  readonly totalReceived: number
  classify(incomingSeq: number): SequenceClassification
  reset(newSeq?: number): void
}

export function createSequenceTracker(initialSeq = 0): SequenceTracker {
  let lastSeq = initialSeq
  let totalReceived = 0

  return {
    get lastSeq() {
      return lastSeq
    },

    get totalReceived() {
      return totalReceived
    },

    classify(incomingSeq: number): SequenceClassification {
      totalReceived++

      if (lastSeq === 0) {
        lastSeq = incomingSeq
        return NEXT
      }

      if (incomingSeq === lastSeq) {
        return { kind: "DUPLICATE", seq: incomingSeq }
      }

      if (incomingSeq > lastSeq + 1) {
        const expected = lastSeq + 1
        lastSeq = incomingSeq
        return { kind: "GAP", expected, received: incomingSeq }
      }

      if (incomingSeq < lastSeq) {
        return { kind: "OUT_OF_ORDER", expected: lastSeq, received: incomingSeq }
      }

      // incomingSeq === lastSeq + 1
      lastSeq = incomingSeq
      return NEXT
    },

    reset(newSeq?: number): void {
      lastSeq = newSeq ?? 0
    },
  }
}
