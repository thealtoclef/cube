# CubeStore Metrics Monitoring Guide

**Version:** Based on CubeStore source code analysis  
**Last Updated:** 2025-10-02

## Table of Contents
1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Metrics Reference](#metrics-reference)
4. [Monitoring Setup](#monitoring-setup)
5. [Alert Recommendations](#alert-recommendations)
6. [Troubleshooting](#troubleshooting)

---

## Overview

CubeStore exports metrics via **StatsD/DogStatsD protocol over UDP**. All metrics are prefixed with `cs.` (short for CubeStore) and are defined in `src/app_metrics.rs`.

### Metric Types

- **Counter** (`c`): Incrementing values (e.g., query count, errors)
- **Gauge** (`g`): Current value that can go up/down (e.g., cache size, queue size)
- **Histogram** (`h`/`ms`): Distribution of values (e.g., query latency)

### Key Characteristics

- **Push-based**: Metrics are sent via UDP to a collector
- **Fire-and-forget**: Won't block operations if collector is down
- **Tagged metrics**: DogStatsD mode supports tags for filtering
- **No sampling**: All metric updates are sent (no client-side aggregation)

---

## Configuration

### Environment Variables

```bash
# Metrics format (default: statsd)
export CUBESTORE_METRICS_FORMAT=dogstatsd  # or "statsd"

# Target address for metrics collector (default: 127.0.0.1)
export CUBESTORE_METRICS_ADDRESS=localhost

# Target UDP port (default: 8125)
export CUBESTORE_METRICS_PORT=8125
```

### DogStatsD vs StatsD Mode

| Feature | StatsD | DogStatsD |
|---------|--------|-----------|
| Tags/Labels | ❌ No | ✅ Yes |
| Histogram type | `ms` (timer) | `h` (histogram) |
| Distribution type | `ms` (timer) | `d` (distribution) |
| Recommended | Basic setups | Production monitoring |

**Recommendation**: Use `dogstatsd` for production to enable tag-based filtering.

---

## Metrics Reference

### 1. Lifecycle Metrics

#### `cs.startup` (Counter)
**Description**: Number of CubeStore process startups  
**When recorded**: On process initialization  
**Use cases**:
- Track restart frequency
- Detect crash loops
- Monitor deployment rollouts

**Alert on**: High restart rate (>1 per hour could indicate instability)

---

### 2. SQL Query Metrics

#### `cs.sql.query.data` (Counter)
**Description**: Count of SQL queries that read data (SELECT queries)  
**Tags**: `command` (e.g., `select`, `create_table`, `insert`)  
**When recorded**: For each data-reading query execution  

**Example metrics:**
```
cs.sql.query.data:1|c|#command:select
cs.sql.query.data:1|c|#command:create_table
cs.sql.query.data:1|c|#command:insert
```

**Use cases**:
- Track query throughput
- Identify peak load times
- Capacity planning

**Alert on**: 
- Sudden drop (possible service issue)
- Sustained high rate (may need scaling)

---

#### `cs.sql.query.data.ms` (Histogram)
**Description**: Execution time for data queries in milliseconds  
**When recorded**: After each data query completes  
**Special behavior**: Slow queries (>200ms) are logged with WARN level

**Use cases**:
- Query performance monitoring
- SLA compliance (e.g., p95 < 1000ms)
- Identify performance degradation

**Alert on**:
- p95 > 1000ms (slow queries)
- p99 > 5000ms (very slow queries)
- Mean increasing over time (performance regression)

---

#### `cs.sql.query.meta` (Counter)
**Description**: Count of metadata queries (queries to system tables, trivial operations)  
**When recorded**: For catalog queries, information_schema queries, etc.

**Use cases**:
- Distinguish metadata overhead from data queries
- Monitor client connection patterns

---

#### `cs.sql.query.meta.ms` (Histogram)
**Description**: Execution time for metadata queries in milliseconds

**Alert on**: p95 > 500ms (metadata queries should be fast)

---

### 3. Query Cache Metrics

#### `cs.sql.query.data.cache.hit` (Counter)
**Description**: Number of query results served from cache  
**When recorded**: When a query result is found in cache

**Use cases**:
- Calculate cache hit rate: `cache.hit / (cache.hit + cache.miss)`
- Optimize cache configuration
- Validate cache effectiveness

**Cache hit rate formula:**
```
hit_rate = cs.sql.query.data.cache.hit / cs.sql.query.data
```

**Alert on**: Hit rate < 20% (cache may be undersized or TTL too short)

---

#### `cs.sql.query.data.cache.size` (Gauge)
**Description**: Approximate number of entries in query result cache  
**When recorded**: After cache operations (insert, eviction, clear)

**Use cases**:
- Monitor cache utilization
- Detect cache thrashing
- Tune cache size

**Alert on**: 
- Near maximum capacity (may need increase)
- Frequent drops to zero (cache being cleared)

---

#### `cs.sql.query.data.cache.weight` (Gauge)
**Description**: Approximate total weighted size of cached entries (in bytes)  
**When recorded**: After cache operations

**Use cases**:
- Memory usage monitoring
- Capacity planning
- Detect memory bloat

**Alert on**: Approaching memory limits

---

### 4. Cache Store Metrics (Key-Value Cache)

#### `cs.sql.query.cache` (Counter)
**Description**: Count of cache store queries (CACHE commands)  
**Tags**: `command` (e.g., `get`, `set`, `delete`)  
**When recorded**: For each cache store operation

---

#### `cs.sql.query.cache.ms` (Histogram)
**Description**: Execution time for cache store operations

**Alert on**: p95 > 100ms (cache operations should be fast)

---

### 5. Queue Metrics

#### `cs.sql.query.queue` (Counter)
**Description**: Count of queue operations (QUEUE commands)  
**Tags**: `command` (queue operation type)  
**When recorded**: For each queue operation

---

#### `cs.sql.query.queue.ms` (Histogram)
**Description**: Execution time for queue operations

**Alert on**: p95 > 200ms

---

### 6. Streaming Metrics (Kafka Integration)

#### `cs.streaming.rows` (Counter)
**Description**: Number of rows read from streaming sources  
**Tags**: `location`, `table` (streaming source identifiers)  
**When recorded**: After processing each batch from Kafka/streaming source

**Use cases**:
- Monitor data ingestion rate
- Detect stalled streams
- Capacity planning

**Alert on**: Rate drops to zero (stream stopped)

---

#### `cs.streaming.chunks` (Counter)
**Description**: Number of data chunks created from streaming data  
**Tags**: `location`, `table`

**Use cases**:
- Monitor ingestion batching efficiency
- Detect fragmentation issues

---

#### `cs.streaming.lastoffset` (Gauge)
**Description**: Last processed offset/sequence number from stream  
**Tags**: `location`, `table`

**Use cases**:
- Track stream position
- Detect processing delays
- Resume point monitoring

**Alert on**: Not advancing for extended period (stream stuck)

---

#### `cs.streaming.lag` (Gauge)
**Description**: Current lag behind stream head (if calculable)  
**Tags**: `location`, `table`  
**Calculation**: `current_head_offset - last_processed_offset`

**Use cases**:
- Monitor real-time processing performance
- Detect backpressure issues
- SLA compliance

**Alert on**: 
- Lag > 10000 (falling behind)
- Lag continuously increasing (consumer too slow)

---

#### `cs.streaming.import_time.ms` (Histogram)
**Description**: Total time to process one streaming batch (end-to-end)  
**Tags**: `location`, `table`

**Components included**: Read → Partition → Upload → Activate

**Alert on**: p95 > 5000ms (batch processing too slow)

---

#### `cs.streaming.partition_time.ms` (Histogram)
**Description**: Time spent partitioning streaming data into chunks  
**Tags**: `location`, `table`

---

#### `cs.streaming.upload_time.ms` (Histogram)
**Description**: Time spent uploading chunks to remote storage  
**Tags**: `location`, `table`

**Alert on**: p95 > 3000ms (slow storage backend)

---

#### `cs.streaming.roundtrip_time.ms` (Histogram)
**Description**: Time between successive batch reads from stream  
**Tags**: `location`, `table`

---

#### `cs.streaming.roundtrip_rows` (Histogram)
**Description**: Number of rows in each roundtrip batch  
**Tags**: `location`, `table`

**Use cases**: Monitor batch sizes, optimize batching

---

#### `cs.streaming.roundtrip_chunks` (Histogram)
**Description**: Number of chunks created per roundtrip  
**Tags**: `location`, `table`

---

### 7. Worker Pool Metrics

#### `cs.worker_pool.errors` (Counter)
**Description**: Errors in inter-process communication with worker pools  
**Tags**: 
- `subprocess_type` (worker process type)
- `error_type` (`send` or `receive`)

**When recorded**: When IPC fails with worker subprocesses

**Use cases**:
- Detect worker crashes
- Monitor cluster health
- Identify communication issues

**Alert on**: Any increase (should be rare in healthy system)

---

### 8. In-Memory Storage Metrics

#### `cs.workers.in_memory_chunks` (Gauge)
**Description**: Number of data chunks held in memory  
**When recorded**: After memory chunk operations

**Use cases**:
- Memory pressure monitoring
- Detect memory leaks

---

#### `cs.workers.in_memory_chunks.rows` (Gauge)
**Description**: Total number of rows in in-memory chunks

---

#### `cs.workers.in_memory_chunks.memory` (Gauge)
**Description**: Total memory used by in-memory chunks (bytes)

**Alert on**: Approaching worker memory limits

---

### 9. Metastore Metrics (RocksDB Metadata)

#### `cs.metastore.queue_size` (Gauge)
**Description**: Number of operations queued for metastore  
**When recorded**: Continuously

**Use cases**:
- Detect metastore bottlenecks
- Monitor write pressure

**Alert on**: 
- Queue size > 1000 (backlog building)
- Sustained high queue (metastore overloaded)

---

#### `cs.metastore.read_operation.ms` (Histogram)
**Description**: Total time for metastore read operations (including queue wait)

---

#### `cs.metastore.inner_read_operation.ms` (Histogram)
**Description**: Actual read operation time (excluding queue wait)

---

#### `cs.metastore.write_operation.ms` (Histogram)
**Description**: Total time for metastore write operations

**Alert on**: p95 > 500ms (metastore slow)

---

#### `cs.metastore.inner_write_operation.ms` (Histogram)
**Description**: Actual write operation time

---

#### `cs.metastore.read_out_queue_operation.ms` (Histogram)
**Description**: Time operations spend in queue before execution

**Alert on**: p95 > 200ms (queue backlog)

---

### 10. CacheStore RocksDB Metrics

#### `cs.cachestore.rocksdb.estimate_live_data_size` (Gauge)
**Description**: Estimated size of live data in RocksDB (bytes)  
**When recorded**: Periodically (every `CUBESTORE_CACHESTORE_METRICS_LOOP` seconds, default 15)

**Use cases**:
- Monitor storage growth
- Capacity planning
- Detect bloat

---

#### `cs.cachestore.rocksdb.live_sst_files_size` (Gauge)
**Description**: Total size of live SST files in RocksDB (bytes)

---

#### `cs.cachestore.rocksdb.cf.default.size` (Gauge)
**Description**: Size of default column family in RocksDB

---

### 11. CacheStore Eviction Metrics

#### `cs.cachestore.eviction.expired.keys` (Counter)
**Description**: Number of expired keys removed from cache store

**Use cases**:
- Monitor TTL effectiveness
- Validate expiration policy

---

#### `cs.cachestore.eviction.expired.size` (Counter)
**Description**: Total size of expired keys removed (bytes)

---

#### `cs.cachestore.eviction.removed.keys` (Counter)
**Description**: Number of keys evicted due to size limits (LRU eviction)

**Alert on**: High eviction rate (cache may be undersized)

---

#### `cs.cachestore.eviction.removed.size` (Counter)
**Description**: Total size of evicted keys (bytes)

---

#### `cs.cachestore.ttl.persist` (Counter)
**Description**: Number of TTL entries persisted to storage

---

#### `cs.cachestore.ttl.buffer` (Gauge)
**Description**: Number of TTL entries in buffer (not yet persisted)

**Alert on**: Buffer size growing unbounded

---

#### `cs.cachestore.scheduler.gc_queue` (Gauge)
**Description**: Size of garbage collection queue in cache store scheduler

---

### 12. Remote Filesystem Metrics

#### `cs.remote_fs.operations.core` (Counter)
**Description**: Number of core remote filesystem operations  
**Tags**: Operation-specific tags (varies by storage backend)  
**When recorded**: For S3, GCS, and other remote storage operations

**Use cases**:
- Monitor storage backend health
- Track API usage/costs
- Detect rate limiting

---

#### `cs.remote_fs.files_to_remove.count` (Gauge)
**Description**: Number of files pending removal from remote storage

---

#### `cs.remote_fs.files_to_remove.size` (Gauge)
**Description**: Total size of files pending removal (bytes)

**Alert on**: Large backlog (cleanup not keeping up)

---

## Monitoring Setup

### Option 1: Prometheus with statsd_exporter

Most common setup for converting StatsD metrics to Prometheus format.

#### 1. Deploy statsd_exporter

```yaml
# docker-compose.yml
version: '3'
services:
  statsd-exporter:
    image: prom/statsd-exporter:latest
    ports:
      - "8125:8125/udp"  # StatsD input
      - "9102:9102"      # Prometheus metrics output
    command:
      - --statsd.mapping-config=/etc/statsd_mapping.yml
    volumes:
      - ./statsd_mapping.yml:/etc/statsd_mapping.yml
```

#### 2. Create Mapping Configuration

```yaml
# statsd_mapping.yml
mappings:
  # Query metrics with command tag
  - match: "cs.sql.query.*"
    name: "cubestore_sql_query_${1}"
    labels:
      command: "$2"
  
  # Streaming metrics with location tag
  - match: "cs.streaming.*"
    name: "cubestore_streaming_${1}"
    labels:
      location: "$2"
      table: "$3"
  
  # Generic mapping for other metrics
  - match: "cs.*"
    name: "cubestore_${1}"
```

#### 3. Configure CubeStore

```bash
export CUBESTORE_METRICS_FORMAT=dogstatsd
export CUBESTORE_METRICS_ADDRESS=statsd-exporter
export CUBESTORE_METRICS_PORT=8125
```

#### 4. Configure Prometheus Scraping

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'cubestore'
    static_configs:
      - targets: ['statsd-exporter:9102']
```

---

### Option 2: DataDog

If using DataDog for monitoring.

#### 1. Deploy DataDog Agent

```yaml
# docker-compose.yml
version: '3'
services:
  datadog-agent:
    image: gcr.io/datadoghq/agent:latest
    environment:
      - DD_API_KEY=${DD_API_KEY}
      - DD_SITE=datadoghq.com
      - DD_DOGSTATSD_NON_LOCAL_TRAFFIC=true
    ports:
      - "8125:8125/udp"
```

#### 2. Configure CubeStore

```bash
export CUBESTORE_METRICS_FORMAT=dogstatsd
export CUBESTORE_METRICS_ADDRESS=datadog-agent
export CUBESTORE_METRICS_PORT=8125
```

---

### Option 3: Telegraf (Multi-Backend)

For more flexibility in output destinations.

#### 1. Deploy Telegraf

```toml
# telegraf.conf
[[inputs.statsd]]
  protocol = "udp"
  service_address = ":8125"
  metric_separator = "."
  parse_data_dog_tags = true

[[outputs.prometheus_client]]
  listen = ":9273"
  
# Or other outputs like InfluxDB, CloudWatch, etc.
[[outputs.influxdb]]
  urls = ["http://influxdb:8086"]
  database = "cubestore"
```

---

## Alert Recommendations

### Critical Alerts (Immediate Action Required)

```yaml
# High error rate
- alert: CubeStoreHighErrorRate
  expr: rate(cubestore_worker_pool_errors[5m]) > 1
  for: 2m
  severity: critical
  description: "Worker pool errors detected: {{ $value }} errors/sec"

# Metastore queue backup
- alert: CubeStoreMetastoreQueueBackup
  expr: cubestore_metastore_queue_size > 1000
  for: 5m
  severity: critical
  description: "Metastore queue backed up: {{ $value }} operations queued"

# Streaming lag excessive
- alert: CubeStoreStreamingLagHigh
  expr: cubestore_streaming_lag > 100000
  for: 10m
  severity: critical
  description: "Streaming lag excessive on {{ $labels.table }}: {{ $value }}"

# Service down
- alert: CubeStoreDown
  expr: up{job="cubestore"} == 0
  for: 1m
  severity: critical
  description: "CubeStore instance is down"
```

### Warning Alerts (Investigation Needed)

```yaml
# Slow queries
- alert: CubeStoreSlowQueries
  expr: histogram_quantile(0.95, rate(cubestore_sql_query_data_ms_bucket[5m])) > 1000
  for: 10m
  severity: warning
  description: "95th percentile query latency is {{ $value }}ms"

# Low cache hit rate
- alert: CubeStoreLowCacheHitRate
  expr: |
    rate(cubestore_sql_query_data_cache_hit[5m]) / 
    rate(cubestore_sql_query_data[5m]) < 0.2
  for: 15m
  severity: warning
  description: "Cache hit rate is {{ $value | humanizePercentage }}"

# High eviction rate
- alert: CubeStoreHighEvictionRate
  expr: rate(cubestore_cachestore_eviction_removed_keys[5m]) > 100
  for: 10m
  severity: warning
  description: "High cache eviction rate: {{ $value }} keys/sec"

# Memory pressure
- alert: CubeStoreMemoryPressure
  expr: cubestore_workers_in_memory_chunks_memory > 10737418240  # 10GB
  for: 5m
  severity: warning
  description: "In-memory chunks using {{ $value | humanize }}B"

# Frequent restarts
- alert: CubeStoreFrequentRestarts
  expr: increase(cubestore_startup[1h]) > 3
  severity: warning
  description: "CubeStore restarted {{ $value }} times in the last hour"
```

### Informational Alerts

```yaml
# Streaming stopped
- alert: CubeStoreStreamingStopped
  expr: rate(cubestore_streaming_rows[5m]) == 0
  for: 30m
  severity: info
  description: "No streaming data received for {{ $labels.table }} in 30m"

# RocksDB growth
- alert: CubeStoreRocksDBGrowth
  expr: |
    increase(cubestore_cachestore_rocksdb_estimate_live_data_size[24h]) > 
    10737418240  # 10GB/day
  severity: info
  description: "RocksDB growing by {{ $value | humanize }}B per day"
```

---

## Grafana Dashboard Example

### Key Panels to Include

#### 1. Query Performance
```promql
# Query rate
rate(cubestore_sql_query_data[5m])

# Query latency (p50, p95, p99)
histogram_quantile(0.95, rate(cubestore_sql_query_data_ms_bucket[5m]))

# Cache hit rate
rate(cubestore_sql_query_data_cache_hit[5m]) / 
rate(cubestore_sql_query_data[5m])
```

#### 2. Streaming Health
```promql
# Ingestion rate
rate(cubestore_streaming_rows{table="$table"}[5m])

# Streaming lag
cubestore_streaming_lag{table="$table"}

# Batch processing time
histogram_quantile(0.95, 
  rate(cubestore_streaming_import_time_ms_bucket{table="$table"}[5m])
)
```

#### 3. System Health
```promql
# Memory usage
cubestore_workers_in_memory_chunks_memory

# Metastore queue
cubestore_metastore_queue_size

# Error rate
rate(cubestore_worker_pool_errors[5m])
```

#### 4. Cache Performance
```promql
# Cache size
cubestore_sql_query_data_cache_size

# Eviction rate
rate(cubestore_cachestore_eviction_removed_keys[5m])

# RocksDB size
cubestore_cachestore_rocksdb_estimate_live_data_size
```

---

## Troubleshooting

### Problem: No metrics appearing

**Possible causes:**
1. Metrics collector not running
2. Wrong IP/port configuration
3. Firewall blocking UDP port 8125
4. CubeStore not configured to send metrics

**Debug steps:**
```bash
# Test UDP connectivity
echo "test.metric:1|c" | nc -u -w1 localhost 8125

# Check CubeStore logs for metrics initialization
grep -i "metrics" cubestore.log

# Verify environment variables
env | grep CUBESTORE_METRICS
```

---

### Problem: Metrics intermittently missing

**Cause:** UDP is lossy by design

**Solutions:**
1. Run collector on same host as CubeStore (minimize packet loss)
2. Monitor packet loss: `netstat -su | grep "packet receive errors"`
3. Increase collector buffer sizes
4. Accept some data loss (inherent to UDP)

---

### Problem: Tags not working

**Cause:** Using StatsD mode instead of DogStatsD

**Solution:**
```bash
export CUBESTORE_METRICS_FORMAT=dogstatsd
```

Restart CubeStore after changing.

---

### Problem: High metric cardinality

**Cause:** Too many unique tag combinations

**Solutions:**
1. Limit streaming tables being monitored
2. Aggregate metrics in collector
3. Use sampling (configure in statsd_exporter)

---

## Performance Considerations

### Metric Reporting Overhead

- **UDP send**: Non-blocking, minimal overhead
- **Frequency**: No built-in aggregation, every metric update is sent
- **Network**: ~100-500 bytes per metric (depending on tags)

### Best Practices

1. **Co-locate collector**: Run statsd_exporter/DataDog agent on same host to minimize network latency
2. **Monitor collector health**: Ensure collector can keep up with metric volume
3. **Adjust sampling**: For very high-frequency metrics, consider sampling in collector
4. **Tag discipline**: Don't use high-cardinality values as tags (e.g., user IDs, timestamps)

---

## Example Production Setup

```yaml
# docker-compose.yml for complete monitoring stack
version: '3.8'

services:
  cubestore:
    image: cubejs/cubestore:latest
    environment:
      - CUBESTORE_METRICS_FORMAT=dogstatsd
      - CUBESTORE_METRICS_ADDRESS=statsd-exporter
      - CUBESTORE_METRICS_PORT=8125
    networks:
      - cubestore-net

  statsd-exporter:
    image: prom/statsd-exporter:latest
    command:
      - --statsd.mapping-config=/etc/statsd_mapping.yml
      - --statsd.listen-udp=:8125
      - --web.listen-address=:9102
    volumes:
      - ./statsd_mapping.yml:/etc/statsd_mapping.yml
    networks:
      - cubestore-net

  prometheus:
    image: prom/prometheus:latest
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=30d
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    ports:
      - "9090:9090"
    networks:
      - cubestore-net

  grafana:
    image: grafana/grafana:latest
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=grafana-piechart-panel
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana-dashboards:/etc/grafana/provisioning/dashboards
    ports:
      - "3000:3000"
    networks:
      - cubestore-net

networks:
  cubestore-net:

volumes:
  prometheus-data:
  grafana-data:
```

---

## Additional Resources

- **CubeStore Documentation**: https://cube.dev/docs/caching/running-in-production
- **StatsD Protocol**: https://github.com/statsd/statsd/blob/master/docs/metric_types.md
- **DogStatsD**: https://docs.datadoghq.com/developers/dogstatsd/
- **Prometheus statsd_exporter**: https://github.com/prometheus/statsd_exporter

---

## Appendix: Complete Metrics List

| Metric Name | Type | Description |
|-------------|------|-------------|
| `cs.startup` | Counter | Process startups |
| `cs.worker_pool.errors` | Counter | IPC errors |
| `cs.sql.query.data` | Counter | Data queries |
| `cs.sql.query.data.cache.hit` | Counter | Cache hits |
| `cs.sql.query.data.cache.size` | Gauge | Cache entry count |
| `cs.sql.query.data.cache.weight` | Gauge | Cache size (bytes) |
| `cs.sql.query.data.ms` | Histogram | Data query latency |
| `cs.sql.query.meta` | Counter | Metadata queries |
| `cs.sql.query.meta.ms` | Histogram | Metadata query latency |
| `cs.sql.query.cache` | Counter | Cache store operations |
| `cs.sql.query.cache.ms` | Histogram | Cache operation latency |
| `cs.sql.query.queue` | Counter | Queue operations |
| `cs.sql.query.queue.ms` | Histogram | Queue operation latency |
| `cs.streaming.rows` | Counter | Streaming rows ingested |
| `cs.streaming.chunks` | Counter | Streaming chunks created |
| `cs.streaming.lastoffset` | Gauge | Last stream offset |
| `cs.streaming.lag` | Gauge | Stream consumer lag |
| `cs.streaming.import_time.ms` | Histogram | Batch import time |
| `cs.streaming.partition_time.ms` | Histogram | Partitioning time |
| `cs.streaming.upload_time.ms` | Histogram | Upload time |
| `cs.streaming.roundtrip_time.ms` | Histogram | Roundtrip time |
| `cs.streaming.roundtrip_rows` | Histogram | Rows per roundtrip |
| `cs.streaming.roundtrip_chunks` | Histogram | Chunks per roundtrip |
| `cs.workers.in_memory_chunks` | Gauge | In-memory chunk count |
| `cs.workers.in_memory_chunks.rows` | Gauge | In-memory rows |
| `cs.workers.in_memory_chunks.memory` | Gauge | In-memory size (bytes) |
| `cs.metastore.queue_size` | Gauge | Metastore queue depth |
| `cs.metastore.read_operation.ms` | Histogram | Metastore read latency |
| `cs.metastore.inner_read_operation.ms` | Histogram | Metastore inner read |
| `cs.metastore.write_operation.ms` | Histogram | Metastore write latency |
| `cs.metastore.inner_write_operation.ms` | Histogram | Metastore inner write |
| `cs.metastore.read_out_queue_operation.ms` | Histogram | Queue wait time |
| `cs.cachestore.rocksdb.estimate_live_data_size` | Gauge | RocksDB live data |
| `cs.cachestore.rocksdb.live_sst_files_size` | Gauge | RocksDB SST size |
| `cs.cachestore.rocksdb.cf.default.size` | Gauge | RocksDB CF size |
| `cs.cachestore.scheduler.gc_queue` | Gauge | GC queue size |
| `cs.cachestore.ttl.persist` | Counter | TTL persists |
| `cs.cachestore.ttl.buffer` | Gauge | TTL buffer size |
| `cs.cachestore.eviction.expired.keys` | Counter | Expired keys removed |
| `cs.cachestore.eviction.expired.size` | Counter | Expired size removed |
| `cs.cachestore.eviction.removed.keys` | Counter | Evicted keys |
| `cs.cachestore.eviction.removed.size` | Counter | Evicted size |
| `cs.remote_fs.operations.core` | Counter | Remote FS operations |
| `cs.remote_fs.files_to_remove.count` | Gauge | Pending file removals |
| `cs.remote_fs.files_to_remove.size` | Gauge | Pending removal size |

---

**End of Guide**

