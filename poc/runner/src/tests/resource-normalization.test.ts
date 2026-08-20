import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  countCpusetCpus,
  effectiveCpuCapacity,
  sampleRunMemoryPeak,
} from "../adapters/cgroup-resource-monitor.js"
import { sourcePortHeadroom } from "../adapters/topology-preflight.js"

describe("Milestone 2 resource normalization", () => {
  it("proves positive source-port headroom for the frozen 25k shard", () => {
    const proof = sourcePortHeadroom(25_000, 28_232)
    assert.deepEqual(proof, {
      viewer_sockets: 25_000,
      non_viewer_outbound_sockets: 64,
      reconnect_time_wait_allowance: 2_500,
      source_port_safety_margin: 512,
      source_port_required: 28_076,
      source_port_headroom: 156,
      source_port_headroom_valid: true,
    })
  })

  it("invalidates a shard when viewers plus TIME_WAIT and reserves exceed the port range", () => {
    const proof = sourcePortHeadroom(25_200, 28_232)
    assert.equal(proof.source_port_required, 28_296)
    assert.equal(proof.source_port_headroom, -64)
    assert.equal(proof.source_port_headroom_valid, false)
  })

  it("normalizes against the smaller of cpu.max and cpuset-effective capacity", () => {
    assert.equal(countCpusetCpus("0-3,8,10-11"), 7)
    assert.equal(effectiveCpuCapacity(800_000, 100_000, 4), 4)
    assert.equal(effectiveCpuCapacity(200_000, 100_000, 8), 2)
    assert.equal(effectiveCpuCapacity(null, 100_000, 3), 3)
  })

  it("derives a per-run memory peak only from sampled memory.current", () => {
    let runPeak: number | null = null
    runPeak = sampleRunMemoryPeak(runPeak, 100)
    runPeak = sampleRunMemoryPeak(runPeak, 150)
    runPeak = sampleRunMemoryPeak(runPeak, 120)
    assert.equal(runPeak, 150)
    // A hypothetical container-lifetime memory.peak of 10,000 is deliberately
    // not an input to the run peak calculation.
    assert.notEqual(runPeak, 10_000)
  })
})
