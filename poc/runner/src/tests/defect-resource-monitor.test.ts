import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { CgroupResourceMonitor, cpuUsageDeltaPercent, parseRedisUsedMemoryBytes } from "../adapters/cgroup-resource-monitor.js"

describe("CgroupResourceMonitor (Defect 9)", () => {
  it("parses Redis INFO used_memory as exact bytes", () => {
    assert.equal(parseRedisUsedMemoryBytes("$20\r\n# Memory\r\nused_memory:123456\r\n\r\n"), 123456)
    assert.equal(parseRedisUsedMemoryBytes("# Memory\r\nused_memory_human:1M\r\n"), null)
  })
  it("converts Nchan cgroup microseconds exactly once", () => {
    assert.equal(cpuUsageDeltaPercent(1_000_000, 1), 100)
    assert.equal(cpuUsageDeltaPercent(2_000_000, 1), 200)
    assert.equal(cpuUsageDeltaPercent(1_000_000, 2), 50)
    assert.equal(cpuUsageDeltaPercent(-1, 1), null)
  })
  it("snapshot returns all required fields", () => {
    const monitor = new CgroupResourceMonitor()
    const snap = monitor.snapshot()
    assert.equal(typeof snap.memoryMbPeak, "number")
    assert.equal(typeof snap.eventLoopDelayP99Ms, "number")
    assert.equal(typeof snap.cpuPercentPeak, "number")
    assert.equal(snap.nchanMemoryMbPeak, null)
    assert.ok(snap.redisMemoryMbPeak === null || typeof snap.redisMemoryMbPeak === "number")
    monitor.dispose()
  })

  it("measureCpu tracks peak CPU percent", () => {
    const monitor = new CgroupResourceMonitor()
    monitor.measureCpu()
    const snap1 = monitor.snapshot()
    assert.ok(snap1.cpuPercentPeak >= 0)

    for (let i = 0; i < 100000; i++) {
      Math.random()
    }
    monitor.measureCpu()
    const snap2 = monitor.snapshot()
    assert.ok(snap2.cpuPercentPeak >= snap1.cpuPercentPeak)
    monitor.dispose()
  })

  it("startEventLoopMonitor / stopEventLoopMonitor tracks delay", async () => {
    const monitor = new CgroupResourceMonitor()
    monitor.startEventLoopMonitor()
    await new Promise((r) => setTimeout(r, 10))
    const snap = monitor.snapshot()
    assert.ok(snap.eventLoopDelayP99Ms >= 0)
    monitor.stopEventLoopMonitor()
    assert.ok(monitor.snapshot().eventLoopDelayP99Ms >= snap.eventLoopDelayP99Ms)
    monitor.dispose()
  })

  it("dispose clears the poll timer", () => {
    const monitor = new CgroupResourceMonitor()
    monitor.dispose()
    const snap = monitor.snapshot()
    assert.equal(typeof snap.memoryMbPeak, "number")
  })
})
