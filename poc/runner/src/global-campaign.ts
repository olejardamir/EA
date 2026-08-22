import fs from "node:fs"
import path from "node:path"
import { aggregateGlobalCampaign } from "./application/global-campaign.js"
import type { GlobalExperimentResult } from "./application/global-coordinator.js"

const directory = process.env.GLOBAL_EVIDENCE_DIR ?? "/evidence"
const runCount = Number.parseInt(process.env.GLOBAL_RUNS ?? "3", 10)
if (!Number.isInteger(runCount) || runCount !== 3) {
  throw new Error("GLOBAL_RUNS must be the frozen qualifying value 3")
}
const campaignId = process.env.CAMPAIGN_ID
const sourceCommit = process.env.GIT_COMMIT_SHA
const baseSeed = Number.parseInt(process.env.BASE_GLOBAL_SEED ?? "", 10)
const campaignStartedAtMs = Number.parseInt(process.env.CAMPAIGN_STARTED_AT_MS ?? "", 10)
if (!campaignId?.trim()) throw new Error("CAMPAIGN_ID is required for campaign aggregation")
if (!sourceCommit || !/^[0-9a-f]{40}$/i.test(sourceCommit)) throw new Error("GIT_COMMIT_SHA must be a full SHA")
if (!Number.isInteger(baseSeed)) throw new Error("BASE_GLOBAL_SEED must be an integer")
if (baseSeed !== 42) throw new Error("BASE_GLOBAL_SEED must be the frozen qualifying base seed 42 (runs 42,43,44)")
if (!Number.isInteger(campaignStartedAtMs) || campaignStartedAtMs <= 0) throw new Error("CAMPAIGN_STARTED_AT_MS must be a positive integer")

const outputPath = path.join(directory, "campaign-result.json")
if (fs.existsSync(outputPath)) throw new Error("stale campaign-result.json exists; fresh campaign storage is required")
const resultFiles = fs.readdirSync(directory).filter((name) => /^global-result-\d+\.json$/.test(name)).sort()
const expectedFiles = Array.from({ length: runCount }, (_, index) => `global-result-${index}.json`)
if (JSON.stringify(resultFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`global result files do not exactly match frozen run set: ${resultFiles.join(",")}`)
}

const runs: GlobalExperimentResult[] = []
for (let index = 0; index < runCount; index++) {
  const filename = path.join(directory, `global-result-${index}.json`)
  if (fs.statSync(filename).mtimeMs < campaignStartedAtMs) {
    throw new Error(`global-result-${index}.json predates the current campaign`)
  }
  runs.push(JSON.parse(fs.readFileSync(filename, "utf8")) as GlobalExperimentResult)
}

const campaign = aggregateGlobalCampaign(runs, {
  campaign_id: campaignId,
  source_commit: sourceCommit,
  run_count: runCount,
  base_seed: baseSeed,
  started_at_ms: campaignStartedAtMs,
})
const temporary = `${outputPath}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(campaign, null, 2)}\n`, "utf8")
fs.renameSync(temporary, outputPath)
process.stdout.write(`${JSON.stringify(campaign)}\n`)
process.exitCode = campaign.verdict === "ACCEPT" ? 0 : 1
