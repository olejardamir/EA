# M5 — Parametric Cost Model

**Currency:** USD. **Pricing retrieval date:** 2026-08-23. **Region:** eu-west-1 (Ireland) origin + CloudFront global edge.  
**Billing basis:** 730 hrs/month; GiB/GB treated as GB for planning (difference immaterial); tax excluded.  
**Commitment basis:** 1-year Compute Savings Plan (≈40% off on-demand) for the steady delivery baseline; Valkey reserved (≈20% off); CloudFront Business flat-rate plan.  
**Sources:** `M5_CURRENT_EXTERNAL_EVIDENCE_LEDGER.md` (all figures cited with URL/date).

---

## 1. Pricing metadata (selected components, eu-west-1, 2026-08)

| Component | Unit | Rate used | Basis |
|---|---|---|---|
| c7g.xlarge (Nchan node) | $/hr | 0.16 (on-dem) → 0.096 (1-yr SP) | cloudprice/aws, 2026-08; ~10% over us-east-1 |
| cache.t4g.medium Valkey | $/hr | 0.054 (on-dem) → 0.043 (reserved) | ElastiCache pricing, 2026-07/08 |
| NLB | $/mo | ~75 | $0.0225/NLB-hr + LCU |
| CloudFront Business | $/mo | 200 (50 TB DTO + 125M req, private VPC origins) | AWS re:Post / pricing, 2026 |
| API Gateway HTTP | $/M req | 1.00 | aws pricing |
| SQS | $/M req | 0.40 | aws pricing |
| Lambda | $/M req | 0.20 (ARM) | aws pricing |
| DynamoDB on-demand | $/M WRU | 1.25 | aws pricing, 2026-08 |
| NATGW | $/mo | 33 + 0.045/GB | aws vpc pricing |
| CloudWatch | $/mo | ~80 | logging/metrics |

---

## 2. Viewer-delivery math (correct, not 10/s × 100k)

The assignment's event rate is **system-wide total**: ~10 events/s steady, ~50/s burst across all 8 matches. A viewer subscribes to **one match + lobby**, so the per-viewer effective rate is the **match share**, not the global total:

```text
per-match steady  = 10/8 ≈ 1.25 events/s
per-match burst   = 50/8 ≈ 6.25 events/s
per-viewer (1 match) ≈ 1.25/s steady, ~7/s burst, + occasional lobby
```

`events/viewer/sec = match_share`, **not** global rate. Per-viewer bytes/sec = `match_share × payload`.

---

## 3. Payload assumption (explicit)

`PAYLOAD_BYTES`: POC synthetic event ≈ 250 B (JSON+SSE framing). **Real provider payload is unknown → PLANNING_ASSUMPTION.** CloudFront/Brotli can compress; SSE streaming compression is a production inference. Model both uncompressed and a ~40% compressed case.

---

## 4. Live-event-hours sensitivity (dominant variable)

`LIVE_EVENT_HOURS_PER_MONTH = H` (peak concurrent × peak duration). Not an assignment fact; show sensitivity.

Uncompressed SSE DTO ≈ `100k × 1.25/s × 250B × 3600 × H = 0.1125 × H TB`.

| H (peak hrs/mo) | Uncompressed DTO | CloudFront (Business cap 50 TB) |
|---|---|---|
| 30 | 3.4 TB | $200 (covers) |
| 120 | 13.5 TB | $200 (covers) |
| 240 | 27 TB | $200 (covers) |
| 444 | 50 TB | $200 (at cap) |
| 720 | 81 TB | exceeds cap → Premium $1000 or PAYG |

The variable DTO driver is **bounded** by the CloudFront Business 50 TB cap for H ≤ ~444.

---

## 5. Fleet-size sensitivity (delivery tier)

Conservative per-node envelope: **8,000 concurrent SSE viewers/node** (c7g.xlarge), deliberately stricter than the M3 failing node (~3× fewer viewers) — `PLANNING_ASSUMPTION`, pre-launch validated.

| Scenario | Partitions P | Viewer capacity | Monthly compute (1-yr SP) |
|---|---|---|---|
| min HA baseline | 12 | 96k | $841 |
| **base recommendation** | **16** | **128k** | **$1,121** |
| higher headroom | 20 | 160k | $1,401 |

Base P=16 covers 100k + N+1 + hot-match expansion + one-node drain.

---

## 6. Full cost ledger (base: P=16, H=120, 1-yr SP, CloudFront Business)

| Line | Formula | Monthly |
|---|---|---|
| Delivery compute (16 × c7g.xlarge, SP) | 16 × 0.096 × 730 | 1,121 |
| Partition-local Valkey (16 × t4g.medium, reserved) | 16 × 0.043 × 730 | 504 |
| NLB (1, per-partition target groups) | — | 75 |
| CloudFront Business (50 TB / 125M req) | — | 200 |
| API Gateway HTTP (≤50M req) | 50 × 1.00 | 50 |
| SQS (≈43M events @120h) | 43 × … | 20 |
| Lambda (canonical processor, few M) | — | 20 |
| DynamoDB on-demand (writes+rebuild reads) | ≈43M WRU + reads | 200 |
| S3 static | — | 10 |
| NAT / VPC endpoints | — | 33 |
| CloudWatch | — | 80 |
| Route53/ACM/misc | — | 5 |
| **TOTAL** | | **≈ 2,318** |

> Valkey is modeled as **16 primary nodes (one per partition)**. HA does **not** use a separate Valkey replica fleet: DynamoDB holds canonical truth, so on node/AZ loss an ASG replacement reseeds hot history from DynamoDB with no event loss. This is why the ledger charges 16 nodes, not 32, and the ~23% margin is computed against that consistent baseline.

---

## 7. Cost conclusion

- **Modeled peak (H=120, base fleet): ≈ $2,318/month — WITHIN BUDGET** with ~$680 (≈23%) margin.
- Dominant fixed driver = always-on delivery compute + Valkey (reserved). Dominant variable = SSE DTO, **bounded** by CloudFront Business 50 TB cap for H ≤ ~444.
- Sensitivity: H=30 → ~$2,300; H=240 → ~$2,320; P=20 headroom → ~$2,750. All within $3k.
- Beyond ~440 peak-hours/month (DTO > 50 TB) or a much larger real payload, cost approaches/exceeds $3k → **CONDITIONALLY WITHIN BUDGET** at extreme usage; re-validate then.
- Request metering (SSE = one long request per viewer, not per event) keeps API Gateway/Lambda/NAT request costs small — unlike managed per-delivery fan-out (rejected, ~$50k/mo).

---

## 8. End-to-end latency budget (planning, not measured)

| Stage | Budget | Classification |
|---|---|---|
| ingest/enqueue (APIGW→SQS→Lambda) | 50–150 ms | PRODUCTION_INFERENCE |
| canonical process/write (DynamoDB tx) | 10–30 ms | PRODUCTION_INFERENCE |
| fan-out publish (Lambda→Nchan partitions) | 10–50 ms | PRODUCTION_INFERENCE |
| edge/network (CloudFront→viewer, EU) | 20–80 ms | PRODUCTION_INFERENCE |
| edge/network (CloudFront→viewer, NA) | +70–120 ms | PRODUCTION_INFERENCE (validate) |
| browser parse/reducer/render | bounded (incremental) | NOT MEASURED |
| **goal p95 ≤ 2 s** | each stage has margin; EU credible, NA validate | — |
| **routine p95 ≤ 5 s** | comfortable | — |
| **full history ≤ 2 s** | active match history small, ordered stream fetch | PRODUCTION_INFERENCE |

Local M3 measured only the delivery portion and missed the frozen gates; production e2e is a planning budget, not a POC-proof claim.

---

## 9. Hidden-infra audit

| Item | Needed? | Note |
|---|---|---|
| VPC / subnets / IGW | yes | standard |
| NAT Gateway | optional | VPC gateway endpoints cover S3/DynamoDB free; NAT only for outbound $33 |
| Route53 / ACM | yes | negligible |
| Cross-AZ transfer | yes | $0.01/GB (DynamoDB reseed of hot history into a replacement node) |
| CloudWatch | yes | $80 observability |
| Backups (Valkey snapshots) | yes | $0.085/GiB-mo, small |

---

## 10. Operating margin

Modeled baseline ≈ $2,318 vs $3,000 ceiling → ~23% margin at H=120. Reasonable
uncertainty (payload, real hours, per-node capacity validation) is covered by the
margin and the CloudFront DTO cap. Classified **WITHIN BUDGET** (with the
extreme-usage CONDITIONALLY note).
