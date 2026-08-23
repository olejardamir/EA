# M5 — Current External Evidence Ledger

**Date:** 2026-08-23  
**Retrieval basis:** live web, primary official AWS sources where possible.  
**Purpose:** record current authoritative facts/quotas/pricing used by M4's selected architecture.

## A. CloudFront (edge + private VPC origin)
- Pay-as-you-go DTO US/EU: $0.085/GB (first 10 TB), $0.080 (next 40 TB), $0.060 (next 100 TB) — aws.amazon.com/cloudfront/pricing, verified 2026-08.
- HTTPS requests: $0.0100/10k (US), $0.0120/10k (EU). HTTP ~half.
- **Origin fetch from AWS origins (S3/ALB/API Gateway/NLB) to CloudFront is $0/GB.**
- Flat-rate plans (expanded 2026): Pro $15/mo (50 TB DTO + 10M req), Business $200/mo (50 TB DTO + 125M req, private VPC origins included), Premium $1000/mo (600 TB + 6B req).
- Behavior: streams chunked origin responses as received; supports private VPC origins; SSE long-lived streams are NOT cached (caching disabled on `/live`). **CloudFront does not coalesce 100k viewer live streams into a few origin connections** — origin connection model sized from documentation.
- Source: aws.amazon.com/cloudfront/pricing, docs.aws.amazon.com CloudFront Developer Guide (custom-origin streaming, private-content-vpc-origins), re:Post flat-rate plans (2026-05).

## B. API Gateway HTTP API
- $1.00 per million requests (first 300M), $0.90 thereafter. Direct AWS-service integration to SQS supported.
- Source: aws.amazon.com/api-gateway/pricing, docs.aws.amazon.com API Gateway developer guide.

## C. SQS FIFO
- $0.40 per million requests (standard/FIFO request); FIFO ordering per MessageGroupId. Throughput far above ~50 events/s.
- Source: aws.amazon.com/sqs/pricing.

## D. Lambda (canonical processor)
- $0.20 per million requests; ARM/Graviton 20% cheaper; 400k GB-s free tier. Not VPC-required (publishes to private NLB via VPC interface endpoint or internal network).
- Source: aws.amazon.com/lambda/pricing, costgoat Lambda guide (2026-08).

## E. DynamoDB (canonical truth)
- On-demand: $1.25 per million write request units, $0.25 per million read request units (us-east-1, 2026). Storage $0.25/GB-mo. No charge for data transfer between DynamoDB and other AWS services in-region.
- Transactions / conditional writes / idempotency supported.
- Source: aws.amazon.com/dynamodb/pricing, usage.ai DynamoDB on-demand (2026-08).

## F. EC2 (delivery tier — Nchan)
- Graviton3 c7g on-demand (us-east-1): c7g.large $0.0725/hr, c7g.xlarge $0.145/hr, c7g.2xlarge $0.29/hr (2026-08, cloudprice/aws-pricing). eu-west-1 ~10% higher.
- 1-yr Compute Savings Plan / Standard RI ≈ 40% off on-demand for steady baseline.
- ASG, Instance Refresh, multi-AZ supported.
- Source: aws.amazon.com/ec2/pricing, cloudprice.net, factualminds (2026-06).

## G. ElastiCache (partition-local Valkey)
- Valkey node-based 20% below Redis OSS. us-east-1: cache.t4g.medium Valkey $0.054/hr ($39/mo), cache.m7g.large Valkey $0.101/hr. Multi-AZ primary+replica, automatic failover. Valkey is AWS-recommended for new deployments.
- Note: the old architecture's Redis-OSS 7.1 assumption is retained for the engine family; Valkey is the cost-effective choice and Nchan documents Redis-compatible storage. A compatibility test before switch is recorded as a pre-launch task (consistent with M4 §15).
- Source: aws.amazon.com/elasticache/pricing, upstash/cloudzero ElastiCache pricing (2026-07/08).

## H. Network / hidden infra
- NLB: ~$0.0225 per NLB-hour + $0.006 per LCU-hour (connections/throughput). Per-partition NLB.
- NAT Gateway: $0.045/hr + $0.045/GB processed (avoided where VPC endpoints used).
- Cross-AZ data transfer: $0.01/GB. Internet egress (EC2): $0.09/GB first 10TB.
- Route 53, ACM: negligible.
- Source: aws.amazon.com/vpc/pricing, usage.ai (2026).

## I. Quotas / feasibility (100k + 40k/120s)
- SQS FIFO, API Gateway, DynamoDB, NLB, EC2 ASG: no default quota blocks 100k long-lived SSE connections or +333 new conn/s. Lambda/DynamoDB scale to the ~10–50 events/s ingest.
- No managed-service default quota is known to block the design; if a per-account limit is hit, it is an adjustable request (pre-launch requirement, not a design blocker).

## J. Conflicting-source resolution
- CloudFront pricing: multiple 2026 secondary sources agree with aws.amazon.com list rates; flat-rate plans confirmed via AWS re:Post (2026-05) and costbench (2026-06). Used AWS list + re:Post.
- Redis vs Valkey: AWS states Valkey 20% cheaper on nodes; chose Valkey for cost, recorded compatibility test as pre-launch.

## K. Decision provenance (selected components)
- SSE vs WebSocket: SSE (read-only workload; Nchan native EventSource). Rejected WebSocket custom gateway (unvalidated custom risk).
- Fan-out: partitioned Nchan fleet (reuses mature tech; removes fixed-topology wall). Managed fan-out rejected on per-delivery cost.
- Partitioning: match-aware + hot-match sub-sharding (solves one-node overload).
- Canonical store: DynamoDB (independent of delivery tier).
- Queue/order: SQS FIFO per match_id.
- Router: deterministic client-side shard path (no singleton).
- Cache: partition-local Valkey (no shared bottleneck).
- Origin: eu-west-1 + CloudFront (NA latency = inference).
- Single-region (multi-region not justified by $3k).

## L. Provider boundary (honesty)
- Real provider semantics/transport unverified (no provider supplied). Assumed HTTPS push; persistent-feed alternative changes only the ingress adapter.
