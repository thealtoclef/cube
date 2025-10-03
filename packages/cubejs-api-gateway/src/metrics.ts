import { Histogram, Counter } from 'prom-client';

// API metric buckets optimized for continue wait mechanism
// Continue wait: default 5s, max 10s per poll, total request up to 30s
//
// PROMETHEUS INDUSTRY STANDARDS:
// - Recommended: 10-15 buckets for most applications
// - Upper limit: 20-30 buckets for high-precision monitoring
// - Best practice: Focus granularity on SLO ranges (1-10s for us)
// - Use exponential growth to balance accuracy vs cardinality
// - Reference: https://prometheus.io/docs/practices/histograms/
//
// Our configuration: 21 buckets (within recommended range)
// 0.01-1s: sparse (fast queries) - 6 buckets
// 1-10s: FOCUSED (critical SLO range) - 12 buckets, ~1s steps
// 10-30s: sparse (slow/timeout) - 3 buckets
const API_RESPONSE_BUCKETS = [
  0.01, 0.05, 0.1, 0.25, 0.5, 1.0,
  1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
  15, 20, 30
];

// Database query execution buckets for actual SQL execution time
// No continue wait mechanism - queries can run much longer for analytical workloads
//
// PROMETHEUS INDUSTRY STANDARDS:
// - Recommended: 10-15 buckets for most applications
// - Upper limit: 20-30 buckets for high-precision monitoring
// - For database metrics: Cover both OLTP (<1s) and OLAP (up to 180s)
// - Use exponential growth to balance accuracy vs resource usage
// - Reference: https://prometheus.io/docs/practices/histograms/
//
// Our configuration: 28 buckets (within acceptable range)
// 0.01-1s: sparse (fast OLTP queries) - 5 buckets
// 1-10s: FOCUSED (typical analytical) - 9 buckets, ~1s steps
// 10-60s: medium (complex queries) - 7 buckets
// 60-300s: sparse (heavy analytical/batch) - 7 buckets, max 5 minutes
const QUERY_EXECUTION_BUCKETS = [
  0.01, 0.1, 0.25, 0.5, 1.0,
  2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
  15, 20, 25, 30, 40, 50, 60,
  75, 90, 120, 150, 180, 240, 300
];

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
  buckets: QUERY_EXECUTION_BUCKETS
});
