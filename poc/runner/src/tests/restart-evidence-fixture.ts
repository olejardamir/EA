export function validRestartStructuredEvidence() {
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
  return { paths: { literal_restart: path("literal-9"), cross_node: path("cross-9") } }
}
