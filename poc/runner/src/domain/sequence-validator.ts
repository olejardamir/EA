export type SequenceClassification =
  | { kind: "NEXT" }
  | { kind: "DUPLICATE"; seq: number }
  | { kind: "GAP"; expected: number; received: number }
  | { kind: "OUT_OF_ORDER"; expected: number; received: number }

export interface SequenceTracker {
  readonly lastSeq: number
  classify(incomingSeq: number): SequenceClassification
  reset(newSeq?: number): void
}

export function createSequenceTracker(initialSeq = 0): SequenceTracker {
  let lastSeq = initialSeq

  return {
    get lastSeq() {
      return lastSeq
    },

    classify(incomingSeq: number): SequenceClassification {
      if (lastSeq === 0) {
        lastSeq = incomingSeq
        return { kind: "NEXT" }
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
      return { kind: "NEXT" }
    },

    reset(newSeq?: number): void {
      lastSeq = newSeq ?? 0
    },
  }
}
