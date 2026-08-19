# Final Simplification Audit

**Date:** 2026-08-19  
**Result:** STOP CONDITION REACHED

Final surviving simplifications:

1. Remove AWS WAF from the baseline; keep it conditional on a demonstrated application-layer abuse requirement.
2. Replace the unverified Nchan→Valkey assumption with the dependency Nchan actually documents: Redis OSS 7.1 on ElastiCache.
3. Remove Artillery as the primary SSE POC generator because its SSE engine is experimental; use a small TypeScript streaming client so the measurement harness does not introduce a second unknown.

All other attempted removals were rejected:

```text
Redis        KEEP — shared Nchan history/cross-node resume
NLB          KEEP — multi-node stable origin/draining
ASG          KEEP — self-healing/live rolling deploy
API Gateway  KEEP — minimal provider HTTPS ingress
SQS FIFO     KEEP — durable acceptance for best-effort provider
Lambda       KEEP — required domain processing
DynamoDB     KEEP — independent canonical truth
CloudFront   KEEP — global viewer edge/private origin
S3           KEEP — frontend/live-release separation
Nchan        KEEP — commodity fan-out product
lobby channel KEEP — simpler/cheaper than replaying all match channels
```

No additional component can currently be removed without either weakening the assignment or replacing a managed/existing responsibility with more custom code.

Next architectural change must be evidence-driven by the Nchan + Redis + SSE POC.
