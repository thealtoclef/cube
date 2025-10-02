import { Histogram, Counter } from 'prom-client';

// Unified histogram buckets for all API metrics
// Optimized distribution: tight in 10-30s range, loose in 30-60s, coarse in 60-120s
const API_RESPONSE_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10, 12.5, 15, 20, 25, 30, 40, 50, 60, 90, 120];

export const loadResponseTime = new Histogram({
  name: 'cube_api_load_response_time',
  help: 'Duration of load response in seconds',
  labelNames: ['tenant', 'api_type', 'query_type', 'slow_query', 'multi_query', 'query_count', 'is_playground'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const metaResponseTime = new Histogram({
  name: 'cube_api_meta_response_time',
  help: 'Duration of meta endpoint response in seconds',
  labelNames: ['tenant', 'endpoint', 'extended'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const preAggregationsResponseTime = new Histogram({
  name: 'cube_api_pre_aggregations_response_time',
  help: 'Duration of pre-aggregations endpoint response in seconds',
  labelNames: ['tenant', 'endpoint'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const cubeSqlResponseTime = new Histogram({
  name: 'cube_api_cubesql_response_time',
  help: 'Duration of CubeSQL endpoint response in seconds',
  labelNames: ['tenant'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const dryRunResponseTime = new Histogram({
  name: 'cube_api_dry_run_response_time',
  help: 'Duration of dry-run endpoint response in seconds',
  labelNames: ['tenant', 'method'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const queryExecutionTime = new Histogram({
  name: 'cube_query_execution_time',
  help: 'Duration of actual query execution time in seconds',
  labelNames: ['tenant', 'data_source', 'external', 'has_error'] as const,
  buckets: API_RESPONSE_BUCKETS
});
