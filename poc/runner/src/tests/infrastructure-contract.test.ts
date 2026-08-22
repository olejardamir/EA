import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

const poc = path.resolve(import.meta.dirname, "../../..")
const read = (relative: string) => fs.readFileSync(path.join(poc, relative), "utf8")

describe("Milestone 2 infrastructure contract", () => {
  it("reads actual Nginx master/worker RLIMITs and reserves worker FD headroom", () => {
    const control = read("nchan/control-server.js")
    assert.match(control, /\/proc\/\$\{pid\}\/limits/)
    assert.match(control, /nginx_master_fd_soft/)
    assert.match(control, /nginx_worker_fd_soft/)
    assert.match(control, /PER_WORKER_FD_RESERVE = 256/)
    assert.match(control, /usable_sse_capacity/)
    assert.match(control, /theoretical_even_distribution/)
    assert.match(control, /worker_distribution_observed: false/)
  })

  it("uses a fresh campaign identity/storage and exact detached terminal-state evidence", () => {
    const launcher = read("run-evidence-100k.sh")
    assert.match(launcher, /CAMPAIGN_ID.*COMPOSE_PROJECT_NAME/)
    assert.match(launcher, /docker volume ls/)
    assert.match(launcher, /docker container ls/)
    assert.match(launcher, /docker network ls/)
    const campaign = read("runner/src/global-campaign.ts")
    assert.match(campaign, /stale campaign-result\.json exists/)
    assert.match(campaign, /do not exactly match frozen run set/)
    assert.match(campaign, /mtimeMs < campaignStartedAtMs/)
    const detached = read("run-detached.sh")
    for (const field of ["start_timestamp", "launcher_pid", "command", "stdout-stderr", "exit_status", "end_timestamp"]) {
      assert.match(detached, new RegExp(field))
    }
  })

  it("freezes exactly four 25k coordinated shards with one publisher owner", () => {
    const compose = read("compose.evidence-100k.yaml")
    // §M3-R: the shared shard environment is declared once via a YAML anchor
    // and inherited by all four shards through merge keys — the frozen values
    // must appear exactly once in the anchor, and every shard must inherit it.
    assert.match(compose, /environment: &runner-env/)
    assert.equal((compose.match(/<<: \*runner-env/g) ?? []).length, 3)
    assert.equal((compose.match(/TARGET_CONNECTIONS: "25000"/g) ?? []).length, 1)
    assert.equal((compose.match(/RUN_MODE: "coordinated-shard"/g) ?? []).length, 1)
    assert.equal((compose.match(/PUBLISHER_OWNER: "true"/g) ?? []).length, 1)
    assert.equal((compose.match(/PUBLISHER_OWNER: "false"/g) ?? []).length, 3)
    for (const shard of ["loadgen-shard-0", "loadgen-shard-1", "loadgen-shard-2", "loadgen-shard-3"]) {
      assert.match(compose, new RegExp(`^  ${shard}:$`, "m"))
    }
    // §v2.1.0: four partition nodes plus one spare replacement node.
    for (const node of ["nchan-p0", "nchan-p1", "nchan-p2", "nchan-p3", "nchan-spare"]) {
      assert.match(compose, new RegExp(`^  ${node}:$`, "m"))
    }
    assert.match(compose, /GLOBAL_TARGET: "100000"/)
  })

  it("keeps coordinated runner FD metadata tied to the selected 120k profile", () => {
    const compose = read("compose.evidence-100k.yaml")
    assert.equal((compose.match(/soft: 120000/g) ?? []).length, 4)
    assert.equal((compose.match(/hard: 120000/g) ?? []).length, 4)

    const printer = read("runner/src/application/result-printer.ts")
    assert.match(printer, /runtime_container_limits: resolveRuntimeContainerLimits\(\)/)
    assert.doesNotMatch(printer, /nofile_(?:soft|hard):\s*100000/)
  })

  it("makes source SHA automatic and mandatory on every normal launch", () => {
    for (const script of ["run-smoke.sh", "run-evidence.sh", "run-evidence-100k.sh"]) {
      const source = read(script)
      assert.match(source, /git[^\n]+rev-parse HEAD/)
      assert.match(source, /export GIT_COMMIT_SHA/)
      assert.match(source, /\^\[0-9a-f\]\{40\}\$/)
    }
    assert.match(read("runner/Dockerfile"), /^ARG GIT_COMMIT_SHA$/m)
  })

  it("routes the normal smoke command through the portable bridge profile", () => {
    const launcher = read("run-smoke.sh")
    assert.match(launcher, /compose\.smoke-portable\.yaml/)
    assert.match(launcher, /--project-name/)
    assert.match(launcher, /down --volumes/, "smoke scratch volumes must be removed")
    const compose = read("compose.smoke-portable.yaml")
    assert.match(compose, /GIT_COMMIT_SHA: "\$\{GIT_COMMIT_SHA:\?Use \.\/run-smoke\.sh\}"/)
    assert.match(compose, /redis-cgroup-evidence:\/redis-cgroup:ro/)
    assert.match(compose, /nchan-portable\.conf:\/etc\/nginx\/nchan-portable\.conf:ro/)
    assert.doesNotMatch(read("nchan/nchan-portable.conf"), /allow host\.docker\.internal/)
  })

  it("exports Redis's actual cpu.max and cpuset evidence outside Redis data", () => {
    const entrypoint = read("redis-cgroup-entrypoint.sh")
    assert.match(entrypoint, /\/sys\/fs\/cgroup\/cpu\.max/)
    assert.match(entrypoint, /\/sys\/fs\/cgroup\/cpuset\.cpus\.effective/)
    assert.match(read("compose.evidence-100k.yaml"), /redis-cgroup-evidence:\/redis-cgroup:ro/)
  })

  it("ships every compose-referenced NGINX_CONF inside the nchan image", () => {
    // Regression: p0's compose env pointed at /etc/nginx/nchan.conf while the
    // image only installed that content as nginx.conf — the partition node
    // crash-looped before serving a single connection. Every NGINX_CONF path
    // referenced by any compose file must be COPYed by the Dockerfile.
    const dockerfile = read("nchan/Dockerfile")
    const composeFiles = ["compose.evidence-100k.yaml", "compose.evidence.yaml", "compose.smoke-portable.yaml"]
    const referenced = new Set<string>()
    for (const file of composeFiles) {
      if (!fs.existsSync(path.join(poc, file))) continue
      const source = read(file)
      for (const match of source.matchAll(/NGINX_CONF:\s*"([^"]+)"/g)) {
        referenced.add(match[1])
      }
    }
    assert.ok(referenced.size > 0, "expected at least one NGINX_CONF reference")
    for (const target of referenced) {
      const copied = [...dockerfile.matchAll(/^COPY\s+(\S+)\s+(\S+)$/gm)]
        .some(([, , dest]) => dest === target)
      assert.ok(
        copied,
        `${target} is referenced by a compose file but never installed by nchan/Dockerfile`,
      )
    }
  })
})
