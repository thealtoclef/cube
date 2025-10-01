# Fallback to Data Source on Pre-Aggregation Failure

**Location**: `docs/operational-guides/fallback-to-data-source.md`

## Overview

This feature provides automatic fallback to querying the source database when pre-aggregation queries fail. This ensures query resilience and high availability by preventing complete query failures due to pre-aggregation issues, while maintaining data accessibility.

## Problem Statement

Pre-aggregations can fail for various reasons:
- Pre-aggregation table not yet built
- Pre-aggregation refresh errors
- CubeStore connectivity issues
- Data schema mismatches
- Storage or memory constraints

Without fallback, these failures result in query errors and degraded user experience. This feature automatically retries failed queries directly against the source database.

## Configuration

### Environment Variable

```bash
# Enable fallback to data source (default: false)
CUBEJS_FALLBACK_TO_DATA_SOURCE=true
```

### Programmatic Configuration

```javascript
// cube.js
module.exports = {
  // ... other options
  fallbackToDataSource: true,
};
```

### Configuration Validation

The option is validated through the server options schema and defaults to `false` if not specified.

## Behavior

### When Fallback Triggers

Fallback is triggered when **all** of the following conditions are met:

1. ✅ `fallbackToDataSource` is enabled (configuration)
2. ✅ Query execution encounters an error
3. ✅ Error is NOT a `ContinueWaitError` (normal queue behavior)
4. ✅ User did NOT explicitly set `disablePreAggregations: true` in query
5. ✅ Pre-aggregations were NOT disabled externally
6. ✅ Query was actually using pre-aggregations (`preAggregations.length > 0`)

### Fallback Flow

```
Query Request
    ↓
Try Execute with Pre-Aggregations
    ↓
Error Occurs ──────────────────┐
    │                          │
    ├─ ContinueWaitError?      │
    │  └─> Re-throw (normal)   │
    │                          │
    ├─ Fallback enabled?       │
    │  └─> No: Re-throw error  │
    │                          │
    ├─> Check conditions       │
    │   (all must be true)     │
    │                          │
    └─> Generate new query     │
        with disablePreAggregations: true
            ↓
        Execute against source database
            ↓
        Return results to user
```

### What Gets Logged

When fallback occurs, a log entry is created:

```javascript
{
  type: 'Fallback To Data Source',
  normalizedQuery: { /* original query */ },
  preAggregation: { /* attempted pre-aggregation */ },
  error: 'Error message'
}
```

## Implementation Details

### Key Files Modified

1. **`packages/cubejs-backend-shared/src/env.ts`**
   - Added `fallbackToDataSource` environment variable

2. **`packages/cubejs-server-core/src/core/types.ts`**
   - Added `fallbackToDataSource` to `OrchestratorOptions` and `OrchestratorInitedOptions`

3. **`packages/cubejs-server-core/src/core/OptsHandler.ts`**
   - Reads configuration from options or environment variable
   - Propagates to orchestrator

4. **`packages/cubejs-server-core/src/core/optionsValidate.ts`**
   - Validates `fallbackToDataSource` as boolean

5. **`packages/cubejs-query-orchestrator/src/orchestrator/QueryOrchestrator.ts`**
   - Stores `fallbackToDataSource` configuration
   - Exposes `getFallbackToDataSource()` method

6. **`packages/cubejs-api-gateway/src/gateway.ts`**
   - Wraps `getSqlResponseInternal` with try-catch
   - Implements fallback logic
   - Generates new query with pre-aggregations disabled
   - Retries query execution

7. **`packages/cubejs-api-gateway/package.json`**
   - Added dependency on `@cubejs-backend/query-orchestrator` for `ContinueWaitError`

### Code Reference

**Fallback Logic:**
```typescript
// gateway.ts
private async getSqlResponseInternal(
  context: RequestContext,
  normalizedQuery: NormalizedQuery,
  sqlQuery: any,
): Promise<ResultWrapper> {
  try {
    return await this._getSqlResponseInternal(context, normalizedQuery, sqlQuery);
  } catch (error: any) {
    // ContinueWaitError is normal behavior and should not trigger fallback
    if (error instanceof ContinueWaitError) {
      throw error;
    }

    const adapterApi = await this.getAdapterApi(context);
    const orchestrator = adapterApi.getQueryOrchestrator();

    // Check if fallback should be triggered
    const shouldFallbackToDataSource =
      orchestrator &&
      orchestrator.getFallbackToDataSource() &&
      !normalizedQuery.disablePreAggregations &&
      !sqlQuery.disableExternalPreAggregations &&
      sqlQuery.preAggregations?.length > 0;

    if (shouldFallbackToDataSource) {
      this.log({
        type: 'Fallback To Data Source',
        normalizedQuery,
        preAggregation: sqlQuery.preAggregation,
        error: error.message || String(error),
      }, context);

      // Generate new SQL query with pre-aggregations disabled
      const fallbackNormalizedQuery = { 
        ...normalizedQuery, 
        disablePreAggregations: true 
      };
      const [fallbackSqlQuery] = await this.getSqlQueriesInternal(
        context,
        [fallbackNormalizedQuery],
      );

      // Execute the fallback query
      return await this._getSqlResponseInternal(
        context, 
        fallbackNormalizedQuery, 
        fallbackSqlQuery
      );
    }
    
    // If fallback is not enabled or not applicable, re-throw the original error
    throw error;
  }
}
```

**Configuration Access:**
```typescript
// QueryOrchestrator.ts
protected readonly fallbackToDataSource: boolean;

public getFallbackToDataSource(): boolean {
  return this.fallbackToDataSource;
}
```

## Performance Considerations

### Impact on Query Performance

When fallback occurs:
- ✅ **Availability**: Queries continue to work despite pre-aggregation failures
- ⚠️ **Performance**: Fallback queries are slower (source database vs pre-aggregated data)
- ⚠️ **Load**: Increases load on source database

### Performance Comparison

| Scenario | Response Time | Database Load |
|----------|---------------|---------------|
| Pre-Aggregation Success | Fast (ms) | Low |
| Pre-Aggregation Failure (no fallback) | Error | None |
| Pre-Aggregation Failure (with fallback) | Slow (seconds) | High |

### Recommendations

1. **Monitor Fallback Frequency**: High fallback rates indicate pre-aggregation issues
2. **Alert on Fallbacks**: Set up alerts when fallback is triggered frequently
3. **Fix Root Causes**: Investigate and resolve pre-aggregation failures
4. **Database Optimization**: Ensure source database can handle fallback queries

## Monitoring

### Track Fallback Events

Monitor logs for fallback events:

```bash
# Grep logs for fallback events
grep "Fallback To Data Source" /path/to/cube/logs
```

### Query Metrics

Use query execution metrics to track performance:

```promql
# Queries without pre-aggregations (may indicate fallback)
rate(cube_query_execution_time_count{pre_aggregations="false"}[5m])

# Average execution time for fallback queries
rate(cube_query_execution_time_sum{pre_aggregations="false"}[5m]) 
/ 
rate(cube_query_execution_time_count{pre_aggregations="false"}[5m])
```

### Recommended Alerts

```yaml
groups:
  - name: cube_fallback_alerts
    rules:
      - alert: HighFallbackRate
        expr: |
          rate(cube_query_execution_time_count{pre_aggregations="false"}[5m])
          / 
          rate(cube_query_execution_time_count[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High fallback rate detected"
          description: "{{ $value | humanizePercentage }} of queries are falling back to data source"
```

## Use Cases

### When to Enable

✅ **Enable fallback when:**
- High availability is critical
- Query failures are unacceptable
- Pre-aggregation reliability is uncertain
- Source database can handle additional load
- User experience is prioritized over performance

❌ **Avoid enabling when:**
- Source database cannot handle additional load
- Pre-aggregations are stable and reliable
- Performance is more critical than availability
- You want queries to fail fast when pre-aggregations are down

## Troubleshooting

### Fallback Not Triggering

**Possible causes:**
1. `fallbackToDataSource` not enabled in configuration
2. Query has `disablePreAggregations: true` (explicit bypass)
3. Query not using pre-aggregations
4. Error is a `ContinueWaitError` (normal behavior)

**Resolution:**
- Verify configuration: `echo $CUBEJS_FALLBACK_TO_DATA_SOURCE`
- Check cube.js config file
- Review query to ensure it should use pre-aggregations
- Check logs for "Fallback To Data Source" entries

### High Fallback Frequency

**Indicates:**
- Pre-aggregation build failures
- CubeStore connectivity issues
- Schema inconsistencies
- Resource constraints

**Actions:**
1. Check pre-aggregation refresh logs
2. Verify CubeStore health
3. Review schema changes
4. Monitor resource usage (memory, disk, CPU)
5. Consider disabling fallback temporarily while fixing root cause

### Source Database Performance Issues

If source database performance degrades:

1. **Disable fallback temporarily**:
   ```bash
   CUBEJS_FALLBACK_TO_DATA_SOURCE=false
   ```

2. **Fix pre-aggregations**: Address root cause of failures

3. **Optimize source queries**: Add indexes, optimize schema

4. **Scale database**: Increase resources if necessary

## Interaction with Other Features

### With `disablePreAggregations` Flag

When query explicitly has `disablePreAggregations: true`:
- Fallback is **not triggered** (user explicitly wants source database)
- Query goes directly to source database
- No fallback logic is involved

### With `renewQuery` Flag

- `renewQuery` forces cache refresh but still uses pre-aggregations
- If pre-aggregation fails during refresh, fallback can still trigger
- Both flags can work together

### With Rollup-Only Mode

When `rollupOnlyMode` is enabled:
- Pre-aggregation failures result in errors
- Fallback is **not recommended** (defeats purpose of rollup-only mode)
- Consider disabling fallback in this scenario

## Best Practices

1. **Enable in Production**: For high-availability requirements
2. **Monitor Actively**: Set up alerts for fallback events
3. **Fix Root Causes**: Don't rely on fallback long-term
4. **Test Thoroughly**: Verify fallback behavior in staging
5. **Document for Ops**: Ensure operations team understands behavior
6. **Capacity Planning**: Ensure source database can handle fallback load

## Security Considerations

- Fallback queries use the same security context as original queries
- No additional permissions are required
- Source database access is governed by existing credentials
- Audit logs should capture both attempts (pre-aggregation and fallback)

## Related Features

- **Disable Pre-Aggregations Per Query**: Manual control (see `disable-pre-aggregations.md`)
- **Pre-Aggregation Refresh**: Scheduled builds to prevent failures
- **Query Metrics**: Track performance and fallback frequency (see `query-metrics.md`)

## References

- [Cube Pre-Aggregations Documentation](https://cube.dev/docs/caching/pre-aggregations)
- [High Availability Best Practices](https://cube.dev/docs/deployment/production-checklist)
- Related: `disable-pre-aggregations.md`, `query-metrics.md`

