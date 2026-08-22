// §v2.1.0 restart-evidence fixtures aligned with the partition-targeted drill:
// - owner shard  → paths.spare_probe (exact cross-node replacement range)
// - target shard → paths.failover_drill (exact replay) + clean pool health
// - bystanders   → paths: {} (non-participation, no fabricated paths)
//
// Every builder embeds the run identity so restartEvidenceMatchesRun can bind
// the evidence to exactly one campaign/global-run/shard triple.

export interface RestartIdentity {
  campaign_id?: string
  experiment_run_id?: string
  run_index?: number
  shard_id?: number
}

function exactPath(transport: string) {
  return {
    transport_resume_id: transport,
    expected_first_seq: 10,
    expected_last_seq: 17,
    received_first_seq: 10,
    received_last_seq: 17,
    expected_count: 8,
    received_required_count: 8,
    missing_required: 0,
    missing_required_sequences: [] as number[],
    duplicates: 0,
    out_of_order: 0,
    out_of_range_before_count: 0,
    out_of_range_after_count: 0,
    missing_prefix: false,
    target_reached: true,
    recovery_ms: 25,
    passed: true,
  }
}

function identityFields(identity: RestartIdentity) {
  return {
    campaign_id: identity.campaign_id ?? "campaign-1",
    experiment_run_id: identity.experiment_run_id ?? "run-1",
    run_index: identity.run_index ?? 0,
    shard_id: identity.shard_id ?? 0,
  }
}

function cleanPool() {
  return {
    failed: 0,
    gaps: 0,
    duplicates: 0,
    order_violations: 0,
    unexpected_disconnects: 0,
  }
}

// Publisher-owner role: spare-node probe is the owner's replacement evidence.
export function validOwnerRestartStructuredEvidence(identity: RestartIdentity = {}) {
  return {
    ...identityFields(identity),
    paths: { spare_probe: exactPath("spare-9") },
    pool: cleanPool(),
  }
}

// Restart-target role: failover-drill path plus clean planned-failover pool.
export function validTargetRestartStructuredEvidence(identity: RestartIdentity = {}) {
  return {
    ...identityFields(identity),
    paths: { failover_drill: exactPath("failover-9") },
    pool: {
      attempted: 25_000,
      reestablished: 25_000,
      failed: 0,
      gaps: 0,
      duplicates: 0,
      order_violations: 0,
      planned_disconnects: 25_000,
      restart_ms: 4_200,
      unexpected_disconnects: 0,
    },
  }
}

// Bystander role: explicit non-participation with no fabricated paths.
export function bystanderRestartStructuredEvidence() {
  return { paths: {}, pool: cleanPool() }
}

// Back-compat alias: historical call sites mean the publisher-owner shape.
export const validRestartStructuredEvidence = validOwnerRestartStructuredEvidence
