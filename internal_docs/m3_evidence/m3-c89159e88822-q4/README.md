# m3-c89159e88822-q4 — LAUNCH FAILURE BEFORE RUN 0 (never a campaign)

The detached launch at the recorded timestamp failed during Compose project bring-up,
**before any container started and before any measurement or observation**:

```
failed to create network m3-c89159e88822-q4_shard-net: Error response from daemon:
invalid pool request: Pool overlaps with other one on this address space
```

Root cause: the host reboot that invalidated q3 left the stale network
`m3-c89159e88822-q3_shard-net` holding subnet `172.28.0.0/16` — exactly the subnet
pinned by the frozen `compose.evidence-100k.yaml`. The frozen compose file was NOT
modified (freeze integrity intact); the stale network was removed instead.

Disposition: all q3/q4 containers, networks, and volumes were removed as dead
artifacts of invalidated attempts. Replacement campaign launched fresh under
`m3-c89159e88822-q5` with new-identity proof. Console log preserved below.
