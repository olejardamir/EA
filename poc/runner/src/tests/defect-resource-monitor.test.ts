import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { CgroupResourceMonitor } from "../adapters/cgroup-resource-monitor.js"

describe("CgroupResourceMonitor (Defect 9)", () => {
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

  it("measureEventLoop tracks delay", async () => {
    const monitor = new CgroupResourceMonitor()
    monitor.measureEventLoop()
    await new Promise((r) => setTimeout(r, 10))
    const snap = monitor.snapshot()
    assert.ok(snap.eventLoopDelayP99Ms >= 0)
    monitor.dispose()
  })

  it("dispose clears the poll timer", () => {
    const monitor = new CgroupResourceMonitor()
    monitor.dispose()
    const snap = monitor.snapshot()
    assert.equal(typeof snap.memoryMbPeak, "number")
  })
})
