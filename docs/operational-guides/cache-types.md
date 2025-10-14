# Understanding Cache Types in Cube

Cube provides detailed visibility into how queries are being served through cache type indicators. This guide explains the different cache types, how they work, and how to monitor them.

## Overview

Every query executed by Cube is served through one of five distinct cache types. Understanding these cache types helps you:

- **Optimize query performance** by identifying which queries benefit from caching
- **Monitor cache effectiveness** through metrics and logs  
- **Debug caching issues** by understanding the caching layers
- **Make informed decisions** about pre-aggregation and cache configurations

---

## The 5 Cache Types

| Type | Value | Speed | Description |
|------|-------|-------|-------------|
| **💨 In-Memory** | `in_memory_cache` | ⚡⚡⚡ | LRU cache (10K entries, up to 5min TTL) |
| **💾 Persistent** | `persistent_cache` | ⚡⚡⚡ | Cache driver (Local/CubeStore) |
| **🚀 Pre-Agg (Cube Store)** | `pre_aggregations_cube_store` | ⚡⚡ | Pre-aggregation in external Cube Store |
| **⚡ Pre-Agg (Data Source)** | `pre_aggregations_data_source` | ⚡ | Pre-aggregation in source database |
| **🐌 No Cache** | `no_cache` | ⚡ | Direct database query |

---

## Two-Tier Cache Flow

```
Query → In-Memory (fastest) → Persistent → Pre-Agg → Database (slowest)
```

Cube uses a two-tier caching system:

```
┌─────────────────────────────────────────────────┐
│           User Query Request                     │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│  Tier 1: In-Memory LRU Cache                    │
│  • Size: 10,000 entries (default)               │
│  • TTL: Up to 5 minutes                         │
│  • Storage: Node.js memory                      │
│  • cache_type: "in_memory_cache"                │
└────────────────┬────────────────────────────────┘
                 │ Cache miss
                 ▼
┌─────────────────────────────────────────────────┐
│  Tier 2: Persistent Cache Driver                │
│  • LocalCacheDriver (dev) or                    │
│  • CubeStoreCacheDriver (prod)                  │
│  • TTL: 24 hours (default)                      │
│  • cache_type: "persistent_cache"               │
└────────────────┬────────────────────────────────┘
                 │ Cache miss
                 ▼
┌─────────────────────────────────────────────────┐
│  Pre-Aggregations Check                         │
│  • Cube Store (external)                        │
│  • Data Source (internal)                       │
│  • cache_type: "pre_aggregations_*"             │
└────────────────┬────────────────────────────────┘
                 │ No pre-aggregation
                 ▼
┌─────────────────────────────────────────────────┐
│  Direct Database Query                          │
│  • Full query execution                         │
│  • cache_type: "no_cache"                       │
└─────────────────────────────────────────────────┘
```

### Key Points

1. **Both tiers always exist**: Every deployment has in-memory cache AND a persistent cache driver
2. **Only one persistent driver**: Either LocalCacheDriver OR CubeStoreCacheDriver, not both
3. **Check order matters**: In-memory → Persistent → Pre-aggregations → Database
4. **Pre-aggregation queries can be cached**: Even pre-aggregation queries go through cache layers

---

## Detailed Cache Type Descriptions

### 1. In-Memory Cache

**Cache Type**: `in_memory_cache`

**Description**: Results were retrieved from Cube's in-memory LRU (Least Recently Used) cache. This is the fastest query retrieval method but requires that the exact same query was run very recently.

**Performance**: ⚡⚡⚡ Very Fast (for repeated queries)

**Characteristics**:
- Stored in Node.js process memory
- Limited size: 10,000 entries by default
- TTL: Up to 5 minutes
- Fastest retrieval path
- Not shared across Cube instances
- Lost on server restart

**When you see this**:
- Same query was executed recently (within minutes)
- Query result fits in memory cache
- High query repetition rate

**Configuration**:
```javascript
// In cube.js configuration
module.exports = {
  orchestratorOptions: {
    queryCacheOptions: {
      maxInMemoryCacheEntries: 10000, // Default
    },
  },
};
```

---

### 2. Persistent Cache

**Cache Type**: `persistent_cache`

**Description**: Results were retrieved from the persistent cache driver (LocalCacheDriver or CubeStoreCacheDriver), but not from in-memory cache. This provides a second-tier cache that can be shared across instances (when using Cube Store).

**Performance**: ⚡⚡⚡ Very Fast

**Characteristics**:
- Cached query results (already computed)
- Slightly slower than in-memory cache (requires cache driver access)
- Much faster than querying database or pre-aggregations
- Can be shared across instances (with Cube Store)
- Survives server restarts (with Cube Store)

**Two implementations**:

#### LocalCacheDriver (Development)
- Storage: Node.js memory
- Shared: No
- Persistent: No (despite the name)
- Configuration: `CUBEJS_CACHE_AND_QUEUE_DRIVER=memory`

#### CubeStoreCacheDriver (Production)
- Storage: Cube Store database
- Shared: Yes
- Persistent: Yes (survives restarts)
- Configuration: `CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore`

**When you see this**:
- Query result was cached but not in in-memory cache
- Result fell out of in-memory LRU cache
- Query is less frequently repeated

---

### 3. Pre-aggregations in Cube Store

**Cache Type**: `pre_aggregations_cube_store`

**Description**: The query utilized existing pre-aggregations stored in Cube Store (external storage), so it did not need to query the source database.

**Performance**: ⚡⚡ Fast

**Characteristics**:
- Uses pre-computed aggregations from Cube Store
- Still requires querying Cube Store (not a cached result)
- Faster than source database queries
- Requires Cube Store setup
- Data refreshed according to pre-aggregation refresh keys

**When you see this**:
- Pre-aggregations are defined in your data model
- `CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore` is configured
- Query matches a pre-aggregation definition
- Pre-aggregation has been built

**Example scenario**:
```yaml
cubes:
  - name: orders
    sql_table: orders
    
    pre_aggregations:
      - name: orders_by_status
        measures:
          - count
        dimensions:
          - status
        
# Query: SELECT status, COUNT(*) FROM orders GROUP BY status
# Result: cacheType = "pre_aggregations_cube_store"
```

---

### 4. Pre-aggregations in Data Source

**Cache Type**: `pre_aggregations_data_source`

**Description**: The query utilized pre-aggregations stored in the source database (internal storage). These queries could gain additional performance by moving pre-aggregations to Cube Store.

**Performance**: ⚡ Slower

**Characteristics**:
- Uses pre-computed aggregations from source database
- Still requires querying the source database
- Faster than full table scans but slower than Cube Store
- No external storage required
- Subject to source database performance

**When you see this**:
- Pre-aggregations are defined in your data model
- Using `CUBEJS_CACHE_AND_QUEUE_DRIVER=memory` or no Cube Store
- Query matches a pre-aggregation definition
- Pre-aggregation has been built in source database

**Optimization tip**: Consider migrating to Cube Store for better performance.

---

### 5. No Cache

**Cache Type**: `no_cache`

**Description**: The query was processed directly in the upstream data source without acceleration from pre-aggregations or cache. These queries could have significant performance improvements if pre-aggregations were configured.

**Performance**: ⚡ Slowest

**Characteristics**:
- Direct database query
- No cache acceleration
- Full query execution time
- Subject to source database performance

**When you see this**:
- First time a query is executed
- Cache has expired or been invalidated
- Query doesn't match any pre-aggregations
- Pre-aggregations are disabled (`disablePreAggregations: true`)
- `forceNoCache` option is used

**Optimization opportunities**:
- Define pre-aggregations for frequent query patterns
- Ensure refresh keys are properly configured
- Review cache expiration settings

---

## Viewing Cache Types

### In API Response

The response includes cache and execution metadata at the root level:

```json
{
  "query": {
    ...query fields...
  },
  "data": [ ... ],
  "lastRefreshTime": "2025-10-11T12:34:56.789Z",
  "cacheType": "pre_aggregations_cube_store",
  "dataSource": "default",
  "dbType": "bigquery",
  "extDbType": "cubestore",
  "external": true,
  "slowQuery": false,
  "usedPreAggregations": { ... }
}
```

**Note**: For multi-query requests (data blending):
- Descriptive metadata (`dataSource`, `dbType`, `cacheType`, `lastRefreshTime`) represents the **first (primary) query**
- `slowQuery` is `true` if **any query** in the request was slow (performance warning)

### In Logs

Server logs include cache type information for each request:

```json
{
  "message": "Load Request Success",
  "query": { ... },
  "duration": 125,
  "apiType": "rest",
  "queryType": "regularQuery",
  "isPlayground": false,
  "queryCount": 1,
  "queryWithPreAggregations": 0,
  "dataSource": "default",
  "dbType": "bigquery",
  "extDbType": "cubestore",
  "external": false,
  "lastRefreshTime": "2025-10-11T07:35:58.286Z",
  "slowQuery": false,
  "cacheType": "persistent_cache",
  "securityContext": {"tenant": "tea"},
  "requestId": "137bdbc0-df7c-4100-a287-8fb9fa51a33c-span-1"
}
```

**Note**: For multi-query requests:
- Descriptive metadata (`dataSource`, `dbType`, `cacheType`, `lastRefreshTime`) represents the **first (primary) query**
- `queryType` indicates the type of query execution (e.g., `regularQuery`, `blendingQuery`, `compareDateRangeQuery`)
- `slowQuery` is `true` if **any query** in the request was slow (performance warning)

### In Prometheus Metrics

The `cube_api_load_response_time` histogram includes a `cache_type` label:

```promql
# Query response times by cache type
cube_api_load_response_time_bucket{
  cache_type="pre_aggregations_cube_store",
  tenant="default",
  api_type="rest"
}

# Average response time by cache type
rate(cube_api_load_response_time_sum[5m]) 
/ 
rate(cube_api_load_response_time_count[5m])

# Cache hit rate (in-memory + persistent)
sum(rate(cube_api_load_response_time_count{
  cache_type=~"in_memory_cache|persistent_cache"
}[5m])) 
/ 
sum(rate(cube_api_load_response_time_count[5m])) 
* 100

# Pre-aggregation usage rate
sum(rate(cube_api_load_response_time_count{
  cache_type=~"pre_aggregations_.*"
}[5m])) 
/ 
sum(rate(cube_api_load_response_time_count[5m])) 
* 100
```

---

## Monitoring and Optimization

### Ideal Distribution

For optimal performance, aim for this distribution:

| Cache Type | Target % | Priority |
|------------|----------|----------|
| In-Memory Cache | 30-50% | High |
| Persistent Cache | 10-20% | Medium |
| Pre-Aggregation (Cube Store) | 20-40% | High |
| Pre-Aggregation (Data Source) | 5-10% | Medium |
| No Cache | <10% | Improve |

### Red Flags

⚠️ **High "no_cache" percentage** (>30%)
- **Issue**: Most queries hitting database directly
- **Solutions**: 
  - Define pre-aggregations for common query patterns
  - Review cache refresh key configuration
  - Check if cache is being invalidated too frequently

⚠️ **Low "in_memory_cache" percentage** (<20%)
- **Issue**: Queries not being repeated
- **Solutions**:
  - Increase `maxInMemoryCacheEntries` if memory allows
  - Review query patterns for optimization opportunities
  - Consider query result reuse strategies

⚠️ **High "pre_aggregations_data_source" percentage** (>50%)
- **Issue**: Pre-aggregations in source database instead of Cube Store
- **Solutions**:
  - Migrate to Cube Store for better performance
  - Configure `CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore`

⚠️ **Low "persistent_cache" percentage** (<5%)
- **Issue**: In-memory cache is too small or TTL is too short
- **Interpretation**: This is actually normal - persistent cache is a fallback
- **Note**: If too high (>40%), in-memory cache might be too small

### Common Prometheus Queries

```promql
# Cache effectiveness over time
sum by (cache_type) (
  rate(cube_api_load_response_time_count[5m])
)

# P95 latency by cache type
histogram_quantile(0.95,
  sum by (cache_type, le) (
    rate(cube_api_load_response_time_bucket[5m])
  )
)

# Cache hit ratio (cached vs uncached)
sum(rate(cube_api_load_response_time_count{
  cache_type!="no_cache"
}[5m])) 
/ 
sum(rate(cube_api_load_response_time_count[5m]))

# Pre-aggregation effectiveness
sum(rate(cube_api_load_response_time_count{
  cache_type=~"pre_aggregations_.*"
}[5m])) 
/ 
sum(rate(cube_api_load_response_time_count[5m]))

# Overall cache hit ratio
sum(rate(cube_api_load_response_time_count{cache_type!="no_cache"}[5m])) 
/ sum(rate(cube_api_load_response_time_count[5m]))
```

---

## Configuration

### Development Setup (Local Cache)

```bash
# .env file
CUBEJS_CACHE_AND_QUEUE_DRIVER=memory
CUBEJS_DEV_MODE=true
```

**Result**:
- In-memory cache: ✅ (LRU, 10K entries)
- Persistent cache: ✅ (LocalCacheDriver, in memory)
- Truly persistent: ❌ (lost on restart)

### Production Setup (Cube Store)

```bash
# .env file
CUBEJS_CACHE_AND_QUEUE_DRIVER=cubestore
CUBEJS_CUBESTORE_HOST=cubestore
CUBEJS_CUBESTORE_PORT=3030
CUBEJS_DEV_MODE=false
```

**Result**:
- In-memory cache: ✅ (LRU, 10K entries, per instance)
- Persistent cache: ✅ (CubeStoreCacheDriver, Cube Store)
- Truly persistent: ✅ (survives restarts, shared across instances)

### Custom Configuration

```javascript
// cube.js
module.exports = {
  // Cache driver selection
  cacheAndQueueDriver: 'cubestore',
  
  orchestratorOptions: {
    queryCacheOptions: {
      // In-memory cache size
      maxInMemoryCacheEntries: 20000, // Increase for more caching
      
      // Refresh key renewal threshold (affects cache freshness)
      refreshKeyRenewalThreshold: 120, // 2 minutes (default)
    },
  },
};
```

---

## Troubleshooting

### Always Getting "no_cache"

**Possible causes**:
1. **Pre-aggregations disabled**: Check for `disablePreAggregations: true` in query
2. **Force no cache**: Check for `forceNoCache: true` in query
3. **First-time queries**: Cache is populated on first execution
4. **Refresh keys changing**: Check if refresh keys are too volatile
5. **Cache driver issues**: Check Cube Store connection if using cubestore mode

**Debugging steps**:
```bash
# Check cache driver configuration
echo $CUBEJS_CACHE_AND_QUEUE_DRIVER

# Check Cube Store connectivity
curl http://cubestore:3030/

# Check logs for cache-related errors
docker logs cube_api | grep -i cache
```

### "persistent_cache" but Expected "in_memory_cache"

**Causes**:
1. **In-memory cache too small**: Entries evicted from LRU cache
2. **Query not repeated quickly enough**: In-memory TTL expired (5 min max)
3. **Multiple Cube instances**: Different instance handled second request

**Solutions**:
```javascript
// Increase in-memory cache size
orchestratorOptions: {
  queryCacheOptions: {
    maxInMemoryCacheEntries: 50000, // Increase from 10000
  },
}
```

### Pre-aggregations Not Being Used

**Debugging steps**:
1. Check pre-aggregation status in Cube Cloud or via API
2. Verify pre-aggregation matches query structure
3. Ensure pre-aggregation has been built
4. Check pre-aggregation refresh schedule

```bash
# Check pre-aggregation status via REST API
curl http://localhost:4000/cubejs-system/v1/pre-aggregations
```

---

## API Reference

### Query Body Options

```typescript
// Disable pre-aggregations for a query
{
  query: { ... },
  disablePreAggregations: true  // Forces direct DB query
}

// Force bypass cache
{
  query: { ... },
  forceNoCache: true  // Skips all cache layers
}

// Renew cache
{
  query: { ... },
  renewQuery: true  // Forces cache refresh
}
```

### Response Format

```typescript
interface Query {
  measures?: string[];
  dimensions?: string[];
  filters?: Filter[];
  timeDimensions?: TimeDimension[];
  // ...other query fields...
}

interface QueryResponse {
  query: Query | Query[];  // Can be single query or array
  data: any[];
  annotation: Annotation;
  dataSource: string;
  dbType: string;
  extDbType?: string;
  external: boolean;
  lastRefreshTime: string;
  slowQuery: boolean;
  cacheType: 'pre_aggregations_cube_store' 
    | 'pre_aggregations_data_source' 
    | 'in_memory_cache' 
    | 'persistent_cache' 
    | 'no_cache';
  usedPreAggregations?: Record<string, PreAggregationInfo>;
  refreshKeyValues?: any[];
  requestId?: string;
}
```

**Note**: For multi-query requests:
- Descriptive metadata (`dataSource`, `dbType`, `cacheType`, `lastRefreshTime`) represents the **first (primary) query**
- `slowQuery` is `true` if **any query** in the request was slow

---

## Multi-Query Requests

When executing multiple queries in a single request (data blending or compare date range), Cube treats the **first query as the primary query**. The response metadata reflects only the first query's characteristics:

### Primary Query Behavior

```json
{
  "query": [
    {
      "measures": ["Orders.count"],
      "timeDimensions": [...]
    },
    {
      "measures": ["Users.count"],
      "timeDimensions": [...]
    }
  ],
  "data": [...],  // Blended data from both queries
  "cacheType": "in_memory_cache",  // From first query only
  "dataSource": "default",         // From first query only
  "lastRefreshTime": "2025-10-14T12:03:05.489Z",  // From first query only
  "slowQuery": false               // true if ANY query was slow
}
```

**Why this behavior?**
- **Descriptive metadata** (dataSource, cacheType, etc.): Represents the primary query characteristics
- **Performance indicators** (`slowQuery`): Alerts if **any part** of the request had performance issues
- The first query is considered the "primary" query that drives the overall request

### Logging Multi-Query Requests

While the API response shows only the first query's metadata, server logs provide visibility into all queries:

```json
{
  "message": "Load Request Success",
  "queryType": "blendingQuery",
  "queryCount": 2,
  "cacheType": "in_memory_cache",  // First query's cache type
  "duration": 125,
  ...
}
```

Use logs to understand the execution characteristics of all queries in a multi-query request.

---

## Key Insights

1. **Both cache tiers always exist**: In-memory + Persistent
2. **Only one persistent driver**: LocalCacheDriver OR CubeStoreCacheDriver
3. **Check order is critical**: Memory → Persistent → Pre-Agg → DB
4. **LocalCacheDriver is NOT persistent**: Despite the name, it's in memory
5. **Primary query metadata**: Multi-query responses use the first query's metadata
6. **Consistent with API behavior**: Logs follow the same primary query convention as API responses

---

## Summary

Cache types provide powerful visibility into how Cube serves your queries. By monitoring cache type distribution and optimizing your configuration:

1. ✅ **Understand performance** - Know where time is spent
2. ✅ **Identify bottlenecks** - See which queries need optimization
3. ✅ **Measure improvements** - Track cache effectiveness over time
4. ✅ **Debug issues** - Quickly identify caching problems
5. ✅ **Make data-driven decisions** - Use metrics to guide optimization

Start monitoring your cache types today to unlock better performance! 🚀

---

## Related Documentation

- [Caching Overview](/docs/product/caching)
- [Getting Started with Pre-Aggregations](/docs/product/caching/getting-started-pre-aggregations)
- [Using Pre-Aggregations](/docs/product/caching/using-pre-aggregations)
- [Production Checklist](/docs/deployment/production-checklist)
- [Monitoring Integrations](/docs/workspace/monitoring-integrations)
