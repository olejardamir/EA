import fs from "node:fs"
import path from "node:path"
import { aggregateGlobalCampaign } from "./application/global-campaign.js"
import type { GlobalExperimentResult } from "./application/global-coordinator.js"

const directory = process.env.GLOBAL_EVIDENCE_DIR ?? "/evidence"
const runCount = Number.parseInt(process.env.GLOBAL_RUNS ?? "3", 10)
if (!Number.isInteger(runCount) || runCount < 3 || runCount > 8) {
  throw new Error("GLOBAL_RUNS must be in the frozen 3..8 range")
}

const runs: GlobalExperimentResult[] = []
for (let index = 0; index < runCount; index++) {
  const filename = path.join(directory, `global-result-${index}.json`)
  runs.push(JSON.parse(fs.readFileSync(filename, "utf8")) as GlobalExperimentResult)
}

const campaign = aggregateGlobalCampaign(runs)
const outputPath = path.join(directory, "campaign-result.json")
const temporary = `${outputPath}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(campaign, null, 2)}\n`, "utf8")
fs.renameSync(temporary, outputPath)
process.stdout.write(`${JSON.stringify(campaign)}\n`)
process.exitCode = campaign.verdict === "ACCEPT" ? 0 : 1
