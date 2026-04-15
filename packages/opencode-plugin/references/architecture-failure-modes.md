# Architecture Failure Modes

Reusable failure-mode patterns for architecture and system design analysis. Load this reference when evaluating technical directions or reviewing proposed architectures.

## Common Failure Categories

### 1. Cascading Failures

A failure in one component propagates to dependent components.

**Pattern:** Service A depends on Service B. B slows down. A's thread pool fills waiting on B. A becomes unavailable. C depends on A and also fails.

**Mitigations:**
- Circuit breakers with configurable thresholds
- Bulkhead isolation (separate thread/connection pools per dependency)
- Timeout budgets that shrink at each hop
- Graceful degradation: serve stale data or reduced functionality

### 2. Thundering Herd

Many clients simultaneously retry or reconnect after a failure, overwhelming the recovering system.

**Pattern:** Cache expires or service restarts. All clients hit the origin simultaneously. Origin cannot handle the spike and fails again.

**Mitigations:**
- Jittered exponential backoff on retries
- Cache stampede protection (lock-and-recompute or probabilistic early expiry)
- Rate limiting at ingress
- Warm-up periods with gradual traffic admission

### 3. Split Brain

Distributed components disagree on system state, leading to conflicting decisions.

**Pattern:** Network partition causes two database replicas to accept writes independently. On reconnection, conflicting writes must be reconciled.

**Mitigations:**
- Quorum-based consensus (majority must agree)
- Leader election with fencing tokens
- Conflict-free replicated data types (CRDTs) where applicable
- Explicit conflict resolution strategy documented before deployment

### 4. Data Corruption Propagation

Bad data enters the system and spreads before detection.

**Pattern:** A bug writes malformed records. Downstream consumers process and transform the bad data. By the time the issue is detected, corrupted data exists in multiple stores.

**Mitigations:**
- Schema validation at write boundaries
- Immutable event logs for replay and correction
- Checksums or version hashes on critical data paths
- Anomaly detection on data quality metrics

### 5. Resource Exhaustion

System runs out of a finite resource (memory, connections, disk, file descriptors).

**Pattern:** Memory leak under sustained load. System runs for days without issue, then OOMs during peak traffic.

**Mitigations:**
- Resource limits and quotas per component
- Health checks that monitor resource consumption trends
- Automatic restart with state recovery
- Load shedding when approaching capacity

### 6. Poison Message / Poison Pill

A single malformed message blocks processing of an entire queue or pipeline.

**Pattern:** Message fails processing, is retried, fails again, blocks all subsequent messages in an ordered queue.

**Mitigations:**
- Dead letter queues after N retry attempts
- Per-message timeout and isolation
- Schema validation before enqueue
- Monitoring on dead letter queue depth

### 7. Clock and Ordering Assumptions

System assumes events arrive in order or that clocks are synchronized.

**Pattern:** Distributed services use wall-clock timestamps for ordering. Clock skew causes event B (which happened after A) to receive an earlier timestamp.

**Mitigations:**
- Logical clocks or vector clocks for causal ordering
- Sequence numbers assigned by a single authority
- Idempotency keys to handle duplicate delivery
- Explicit "happens-before" relationships in event schemas

### 8. Configuration Drift

Production configuration diverges from tested configuration over time.

**Pattern:** Manual hotfix changes a config value in production. The change is not reflected in version control. Next deployment overwrites the fix, causing an outage.

**Mitigations:**
- Infrastructure as code with drift detection
- Immutable deployments (no in-place config changes)
- Config validation on startup with fail-fast behavior
- Audit log for all configuration changes

## Risk Assessment Quick Reference

### Likelihood Indicators

| Signal | Likelihood |
|--------|-----------|
| Has happened before in similar systems | High |
| Requires specific conditions but is well-documented | Medium |
| Theoretically possible but rare in practice | Low |

### Impact Indicators

| Signal | Impact |
|--------|--------|
| Data loss or corruption affecting users | High |
| Service unavailable for extended period | High |
| Degraded performance, partial functionality loss | Medium |
| Cosmetic or non-critical feature affected | Low |

### Prioritization

Address risks in this order:
1. **High likelihood + High impact** — Must mitigate before shipping
2. **Low likelihood + High impact** — Must have a recovery plan
3. **High likelihood + Low impact** — Fix when convenient, monitor always
4. **Low likelihood + Low impact** — Document and accept

## Edge-Case Scanning Checklist

Use this checklist when reviewing any proposed architecture:

- [ ] **Empty/null inputs** — What happens with no data?
- [ ] **Maximum scale** — Behavior at 100x expected load?
- [ ] **Partial failure** — One component down, rest running?
- [ ] **Network partition** — Components cannot reach each other?
- [ ] **Clock skew** — Timestamps disagree across nodes?
- [ ] **Concurrent writes** — Two users modify the same resource?
- [ ] **Schema evolution** — Old clients meet new data format?
- [ ] **Rollback safety** — Can we revert without data loss?
- [ ] **Cold start** — System behavior on first boot with empty state?
- [ ] **Dependency unavailability** — External API down for 1 hour?
- [ ] **Disk full / resource exhaustion** — Finite resources depleted?
- [ ] **Poison data** — Malformed input enters the pipeline?

---

*Architecture Failure Modes Reference v1.0*
*Load via: `goop_reference({ name: "architecture-failure-modes" })`*
