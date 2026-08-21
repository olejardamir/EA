export function validRestartStructuredEvidence(identity: {
  campaign_id?: string
  experiment_run_id?: string
  run_index?: number
  shard_id?: number
} = {}) {
  const path = (transport: string) => ({
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
  })
  return {
    campaign_id: identity.campaign_id ?? "campaign-1",
    experiment_run_id: identity.experiment_run_id ?? "run-1",
    run_index: identity.run_index ?? 0,
    shard_id: identity.shard_id ?? 0,
    paths: { literal_restart: path("literal-9"), cross_node: path("cross-9") },
  }
}
