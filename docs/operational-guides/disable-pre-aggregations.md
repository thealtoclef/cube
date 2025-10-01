# Disable Pre-Aggregations Per Query

**Location**: `docs/operational-guides/disable-pre-aggregations.md`

## Overview

This feature allows disabling pre-aggregations on a per-query basis, providing fine-grained control over when to use pre-aggregated data versus querying the source database directly. This is useful for testing, debugging, or when fresh data is required without waiting for pre-aggregation refreshes.

## Use Cases

- **Testing & Development**: Compare query results with and without pre-aggregations
- **Data Freshness Requirements**: Get real-time data when pre-aggregations may be stale
- **Debugging**: Troubleshoot pre-aggregation issues by bypassing them temporarily
- **Ad-hoc Analysis**: Perform one-off queries without creating pre-aggregations

## Usage

### REST API

Add the `disablePreAggregations` flag to your query:

```json
{
  "query": {
    "dimensions": ["Orders.status"],
    "measures": ["Orders.count"],
    "timeDimensions": [{
      "dimension": "Orders.createdAt",
      "granularity": "day"
    }],
    "disablePreAggregations": true
  }
}
```

### GraphQL API

```graphql
query {
  cube(
    where: {...}
    disablePreAggregations: true
  ) {
    Orders {
      status
      count
    }
  }
}
```

### SQL API

This flag is automatically handled when queries are translated from the REST/GraphQL APIs. Direct SQL queries bypass pre-aggregations by nature.

## Implementation Details

### Request Flow

```
API Request with disablePreAggregations: true
    ↓
Query validation (Joi schema)
    ↓
Query normalization
    ↓
API Gateway passes flag to query body
    ↓
Query Orchestrator receives flag
    ↓
PreAggregations.loadAllPreAggregationsIfNeeded() checks flag
    ↓
If true: Skip pre-aggregation loading, return empty list
    ↓
Query executes directly against data source
```

### Key Files Modified

1. **`packages/cubejs-api-gateway/src/query.js`**
   - Added `disablePreAggregations` to Joi schema validation

2. **`packages/cubejs-api-gateway/src/types/query.ts`**
   - Added `disablePreAggregations?: boolean` to Query interface

3. **`packages/cubejs-api-gateway/src/gateway.ts`**
   - Propagates `disablePreAggregations` flag through query processing
   - Sets `disableExternalPreAggregations` for SQL query generation
   - Passes flag to query body for orchestrator

4. **`packages/cubejs-query-orchestrator/src/orchestrator/QueryCache.ts`**
   - Added `disablePreAggregations` to QueryBody type

5. **`packages/cubejs-query-orchestrator/src/orchestrator/PreAggregations.ts`**
   - Short-circuits pre-aggregation loading when flag is true
   - Returns empty `preAggregationsTablesToTempTables` array

### Code Reference

**Pre-aggregation Loading Logic:**
```typescript
// PreAggregations.ts
public async loadAllPreAggregationsIfNeeded(queryBody: QueryBody): Promise<{
  preAggregationsTablesToTempTables: PreAggTableToTempTable[],
  values: null | string[],
}> {
  // If pre-aggregations are disabled, return empty results
  if (queryBody.disablePreAggregations) {
    return {
      preAggregationsTablesToTempTables: [],
      values: null,
    };
  }
  
  // Normal pre-aggregation loading logic...
}
```

**Query Body Propagation:**
```typescript
// gateway.ts
const queries = [{
  ...sqlQuery,
  query: sqlQuery.sql[0],
  values: sqlQuery.sql[1],
  continueWait: true,
  renewQuery: normalizedQuery.renewQuery,
  disablePreAggregations: normalizedQuery.disablePreAggregations, // Propagated here
  requestId: context.requestId,
  context,
  persistent: false,
}];
```

## Performance Considerations

### Impact

- **With Pre-Aggregations**: Queries are fast but may serve slightly stale data
- **Without Pre-Aggregations**: Queries hit the source database directly, slower but always fresh

### When to Use

✅ **Good Use Cases:**
- One-off administrative queries
- Data verification and testing
- Debugging pre-aggregation discrepancies
- Queries requiring absolute latest data

❌ **Avoid Using For:**
- High-frequency dashboard queries
- Production user-facing queries (unless specifically required)
- Large-scale data exports (will be slow)

## Configuration

### No Configuration Required

This is a query-level flag that requires no server configuration. It works out of the box once implemented.

### Query Validation

The flag is validated through the Joi schema:

```javascript
// query.js
const querySchema = Joi.object().keys({
  // ... other fields
  disablePreAggregations: Joi.boolean(),
});
```

Only boolean values (`true` or `false`) are accepted.

## Monitoring

### Tracking Usage

You can track queries with pre-aggregations disabled using the existing query metrics:

```promql
# Queries without pre-aggregations
cube_query_execution_time_count{pre_aggregations="false"}

# Compare execution times
rate(cube_query_execution_time_sum{pre_aggregations="false"}[5m]) 
/ 
rate(cube_query_execution_time_count{pre_aggregations="false"}[5m])
```

### Logs

Queries with `disablePreAggregations: true` will show in logs with the flag visible in the query body.

## Troubleshooting

### Query Still Using Pre-Aggregations

**Possible causes:**
1. Flag not properly passed in request body
2. Caching layer serving cached results
3. Query plan already generated with pre-aggregations

**Resolution:**
- Verify the flag is at the correct level in request JSON
- Add `renewQuery: true` to bypass cache
- Check logs to confirm flag is received

### Query Performance Issues

If queries are very slow with pre-aggregations disabled:

1. **Expected behavior**: Source database queries are naturally slower
2. **Optimize the source query**: Add indexes, optimize schema
3. **Consider creating appropriate pre-aggregations** for production use
4. **Use this flag sparingly** for production workloads

### Type Errors

Ensure the flag is a boolean, not a string:

```json
// ✅ Correct
{ "disablePreAggregations": true }

// ❌ Wrong
{ "disablePreAggregations": "true" }
```

## Related Features

- **`renewQuery`**: Forces cache refresh (works with this flag)
- **`forceNoCache`**: Bypasses query result cache
- **Fallback to Data Source**: Automatic fallback when pre-aggregations fail (see `fallback-to-data-source.md`)

## Examples

### Compare Results

```bash
# Query with pre-aggregations
curl -X POST http://localhost:4000/cubejs-api/v1/load \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "measures": ["Orders.count"],
      "dimensions": ["Orders.status"]
    }
  }'

# Same query without pre-aggregations
curl -X POST http://localhost:4000/cubejs-api/v1/load \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "measures": ["Orders.count"],
      "dimensions": ["Orders.status"],
      "disablePreAggregations": true
    }
  }'
```

### Testing Data Freshness

```javascript
// JavaScript SDK
const resultWithPreAgg = await cubejsApi.load({
  measures: ['Orders.count'],
  dimensions: ['Orders.status']
});

const resultWithoutPreAgg = await cubejsApi.load({
  measures: ['Orders.count'],
  dimensions: ['Orders.status'],
  disablePreAggregations: true
});

// Compare results
console.log('Difference:', 
  resultWithoutPreAgg.loadResponse.data.length - 
  resultWithPreAgg.loadResponse.data.length
);
```

## References

- [Cube Pre-Aggregations Documentation](https://cube.dev/docs/caching/pre-aggregations)
- [Query Format Documentation](https://cube.dev/docs/query-format)
- Related: `fallback-to-data-source.md`

