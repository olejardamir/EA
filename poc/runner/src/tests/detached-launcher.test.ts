import { after, describe, it } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const POC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const WRAPPER = path.join(POC_DIR, "run-detached.sh")
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "ea-detached-test-"))
after(() => rmSync(tempRoot, { recursive: true, force: true }))

function waitForStatus(recordDir: string, timeoutMs = 5_000): number {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      return Number(readFileSync(path.join(recordDir, "exit_status.txt"), "utf8").trim())
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20)
    }
  }
  throw new Error(`timed out waiting for ${recordDir}/exit_status.txt`)
}

function launch(name: string, command: string[]): string {
  const recordDir = path.join(tempRoot, name)
  const result = spawnSync(WRAPPER, [recordDir, "--", ...command], { encoding: "utf8" })
  assert.equal(result.status, 0, result.stderr)
  return recordDir
}

describe("detached launcher terminal-state capture", () => {
  it("records exit 0 with all required evidence fields", () => {
    const record = launch("zero", ["bash", "-c", "printf success"])
    assert.equal(waitForStatus(record), 0)
    assert.equal(readFileSync(path.join(record, "stdout-stderr.log"), "utf8"), "success")
    for (const field of ["start_timestamp.txt", "launcher_pid.txt", "child_pid.txt", "command.txt", "end_timestamp.txt"]) {
      assert.ok(readFileSync(path.join(record, field), "utf8").trim(), `${field} must be populated`)
    }
  })

  it("records a known non-zero exit exactly", () => {
    const record = launch("nonzero", ["bash", "-c", "exit 37"])
    assert.equal(waitForStatus(record), 37)
  })

  it("records a command terminated by signal using 128+signal", () => {
    const record = launch("signal", ["bash", "-c", "kill -TERM $$"])
    assert.equal(waitForStatus(record), 143)
  })

  it("refuses to overwrite a prior detached evidence record", () => {
    const record = launch("freshness", ["bash", "-c", "exit 0"])
    assert.equal(waitForStatus(record), 0)
    const second = spawnSync(WRAPPER, [record, "--", "bash", "-c", "exit 0"], { encoding: "utf8" })
    assert.equal(second.status, 2)
    assert.match(second.stderr, /Refusing to reuse/)
  })
})
