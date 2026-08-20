import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { loadConfig } from "../config/experiment-config.js"

describe("ExperimentConfig", () => {
  it("throws when TARGET_CONNECTIONS is missing", () => {
    const saved = process.env.TARGET_CONNECTIONS
    delete process.env.TARGET_CONNECTIONS
    try {
      assert.throws(() => loadConfig(), /Missing required env var: TARGET_CONNECTIONS/)
    } finally {
      if (saved !== undefined) process.env.TARGET_CONNECTIONS = saved
    }
  })

  it("loads targetConnections from env", () => {
    const saved = process.env.TARGET_CONNECTIONS
    process.env.TARGET_CONNECTIONS = "500"
    try {
      const config = loadConfig()
      assert.equal(config.targetConnections, 500)
    } finally {
      if (saved !== undefined) process.env.TARGET_CONNECTIONS = saved
      else delete process.env.TARGET_CONNECTIONS
    }
  })

  it("throws on non-positive TARGET_CONNECTIONS", () => {
    const saved = process.env.TARGET_CONNECTIONS
    process.env.TARGET_CONNECTIONS = "0"
    try {
      assert.throws(() => loadConfig(), /Invalid TARGET_CONNECTIONS/)
    } finally {
      if (saved !== undefined) process.env.TARGET_CONNECTIONS = saved
      else delete process.env.TARGET_CONNECTIONS
    }
  })

  it("defaults runProfile to smoke", () => {
    const savedProfile = process.env.RUN_PROFILE
    const savedTarget = process.env.TARGET_CONNECTIONS
    process.env.TARGET_CONNECTIONS = "100"
    delete process.env.RUN_PROFILE
    try {
      const config = loadConfig()
      assert.equal(config.runProfile, "smoke")
    } finally {
      if (savedProfile !== undefined) process.env.RUN_PROFILE = savedProfile
      if (savedTarget !== undefined) process.env.TARGET_CONNECTIONS = savedTarget
      else delete process.env.TARGET_CONNECTIONS
    }
  })

  it("sets runProfile to evidence when env is evidence", () => {
    const savedProfile = process.env.RUN_PROFILE
    const savedTarget = process.env.TARGET_CONNECTIONS
    process.env.TARGET_CONNECTIONS = "100"
    process.env.RUN_PROFILE = "evidence"
    try {
      const config = loadConfig()
      assert.equal(config.runProfile, "evidence")
    } finally {
      if (savedProfile !== undefined) process.env.RUN_PROFILE = savedProfile
      else delete process.env.RUN_PROFILE
      if (savedTarget !== undefined) process.env.TARGET_CONNECTIONS = savedTarget
      else delete process.env.TARGET_CONNECTIONS
    }
  })

  it("no longer has workerCount field", () => {
    const savedTarget = process.env.TARGET_CONNECTIONS
    process.env.TARGET_CONNECTIONS = "100"
    try {
      const config = loadConfig()
      assert.equal((config as any).workerCount, undefined)
    } finally {
      if (savedTarget !== undefined) process.env.TARGET_CONNECTIONS = savedTarget
      else delete process.env.TARGET_CONNECTIONS
    }
  })

  it("resolves surge duration from configuration with a 120-second default", () => {
    const savedTarget = process.env.TARGET_CONNECTIONS
    const savedSurge = process.env.SURGE_SECONDS
    process.env.TARGET_CONNECTIONS = "100"
    delete process.env.SURGE_SECONDS
    try {
      assert.equal(loadConfig().surgeSeconds, 120)
      process.env.SURGE_SECONDS = "5"
      assert.equal(loadConfig().surgeSeconds, 5)
    } finally {
      if (savedTarget !== undefined) process.env.TARGET_CONNECTIONS = savedTarget
      else delete process.env.TARGET_CONNECTIONS
      if (savedSurge !== undefined) process.env.SURGE_SECONDS = savedSurge
      else delete process.env.SURGE_SECONDS
    }
  })
})
