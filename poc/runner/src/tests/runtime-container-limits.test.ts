import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  parseProcLimitsMaxOpenFiles,
  parseCpuMaxCores,
  parseMemoryMaxGiB,
  resolveRuntimeContainerLimits,
} from "../adapters/runtime-container-limits.js"
import { ACTIVE_CONTRACT_VERSION } from "../domain/active-contract.js"

// §M2-3.3D: Machine provenance must reflect the actual launched topology.
// These tests make drift between hard-coded assumptions and launcher-provided
// values obvious.

const PROC_LIMITS_120K = `Limit                     Soft Limit           Hard Limit           Units
Max cpu time              unlimited            unlimited            seconds
Max open files            120000               120000               files
Max address space         unlimited            unlimited            bytes`

const PROC_LIMITS_100K = PROC_LIMITS_120K.replace("120000               120000", "100000               100000")

describe("parseProcLimitsMaxOpenFiles", () => {
  it("parses soft/hard from /proc limits text", () => {
    assert.deepEqual(parseProcLimitsMaxOpenFiles(PROC_LIMITS_120K), { soft: 120000, hard: 120000 })
  })

  it("returns nulls when the Max open files line is absent", () => {
    assert.deepEqual(parseProcLimitsMaxOpenFiles("Limit Soft Hard Units\nMax stack 8192 8192 bytes"), {
      soft: null,
      hard: null,
    })
  })
})

describe("parseCpuMaxCores", () => {
  it("converts quota/period to cores", () => {
    assert.equal(parseCpuMaxCores("800000 100000"), 8)
    assert.equal(parseCpuMaxCores("400000 100000"), 4)
  })

  it("returns null for unlimited or malformed input", () => {
    assert.equal(parseCpuMaxCores("max 100000"), null)
    assert.equal(parseCpuMaxCores(null), null)
    assert.equal(parseCpuMaxCores("garbage"), null)
  })
})

describe("parseMemoryMaxGiB", () => {
  it("converts bytes to GiB", () => {
    assert.equal(parseMemoryMaxGiB("8589934592"), 8)
  })

  it("returns null for unlimited or malformed input", () => {
    assert.equal(parseMemoryMaxGiB("max"), null)
    assert.equal(parseMemoryMaxGiB(null), null)
  })
})

describe("resolveRuntimeContainerLimits", () => {
  it("runner nofile comes from /proc/self/limits, not a hard-coded constant", () => {
    const limits = resolveRuntimeContainerLimits({}, () => PROC_LIMITS_120K)
    assert.equal(limits.runner.nofile_soft, 120000)
    assert.equal(limits.runner.nofile_hard, 120000)
  })

  it("coordinated profile cannot emit stale runner nofile=100000 when launched at 120000", () => {
    // Regression guard for §M2-3.3A: the printer previously hard-coded
    // runner nofile 100000 while compose.evidence-100k.yaml launches 120000.
    const limits = resolveRuntimeContainerLimits(composeEvidenceEnv(), () => PROC_LIMITS_120K)
    assert.notEqual(limits.runner.nofile_soft, 100000)
    assert.equal(limits.runner.nofile_soft, 120000)
  })

  it("DUT service limits resolve from launcher env", () => {
    const limits = resolveRuntimeContainerLimits(composeEvidenceEnv(), () => PROC_LIMITS_120K)
    assert.equal(limits.nchan.cpus, 4)
    assert.equal(limits.nchan.memory_gb, 8)
    assert.equal(limits.nchan.nofile_soft, 200000)
    assert.equal(limits.nchan.nofile_hard, 200000)
    assert.equal(limits.nchan_2.cpus, 4)
    assert.equal(limits.nchan_2.memory_gb, 4)
    assert.equal(limits.redis.cpus, 2)
    assert.equal(limits.redis.memory_gb, 2)
  })

  it("unknown DUT values are null rather than plausible-but-wrong numbers", () => {
    const limits = resolveRuntimeContainerLimits({}, () => PROC_LIMITS_100K)
    assert.equal(limits.nchan.cpus, null)
    assert.equal(limits.nchan.memory_gb, null)
    assert.equal(limits.nchan.nofile_soft, null)
    assert.equal(limits.redis.nofile_hard, null)
  })

  it("unreadable runner proc files yield nulls instead of throwing", () => {
    const limits = resolveRuntimeContainerLimits({}, () => {
      throw new Error("ENOENT")
    })
    assert.equal(limits.runner.nofile_soft, null)
    assert.equal(limits.runner.cpus, null)
    assert.equal(limits.runner.memory_gb, null)
  })
})

// Mirrors the environment compose.evidence-100k.yaml provides to each shard.
function composeEvidenceEnv(): Record<string, string> {
  return {
    NCHAN_CPU_MAX_QUOTA: "400000",
    NCHAN_CPU_MAX_PERIOD: "100000",
    NCHAN_MEMORY_GB: "8",
    NCHAN_NOFILE_SOFT: "200000",
    NCHAN_NOFILE_HARD: "200000",
    NCHAN2_CPU_MAX_QUOTA: "400000",
    NCHAN2_CPU_MAX_PERIOD: "100000",
    NCHAN2_MEMORY_GB: "4",
    NCHAN2_NOFILE_SOFT: "200000",
    NCHAN2_NOFILE_HARD: "200000",
    REDIS_CPU_MAX_QUOTA: "200000",
    REDIS_CPU_MAX_PERIOD: "100000",
    REDIS_MEMORY_GB: "2",
  }
}

describe("canonical contract version source", () => {
  it("exports the frozen successor version", () => {
    assert.equal(ACTIVE_CONTRACT_VERSION, "v2.2.0")
  })
})
