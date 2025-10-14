import { Histogram } from 'prom-client';

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
// Our configuration: 24 buckets (within recommended range)
// 0.01-1s: exponential growth for sub-second queries - 7 buckets
// 1-10s: FOCUSED (critical SLO range) - 14 buckets, 0.5-1s steps
// 10-30s: sparse (slow/timeout) - 3 buckets
const API_RESPONSE_BUCKETS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0,
  1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
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
// Our configuration: 30 buckets (within acceptable range)
// 0.01-1s: exponential growth for sub-second OLTP queries - 7 buckets
// 1-10s: FOCUSED (typical analytical) - 12 buckets, 0.5-1s steps
// 10-60s: medium (complex queries) - 7 buckets
// 60-300s: sparse (heavy analytical/batch) - 4 buckets, max 5 minutes
const QUERY_EXECUTION_BUCKETS = [
  0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0,
  1.5, 2.0, 3.0, 3.5, 4.0, 4.5, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0,
  15, 20, 25, 30, 40, 50, 60,
  90, 120, 180, 300
];

export const loadResponseTime = new Histogram({
  name: 'cube_api_load_response_time',
  help: 'Duration of load response in seconds',
  labelNames: ['tenant', 'api_type', 'query_type', 'cache_type', 'raw_sql', 'slow_query', 'query_count', 'is_playground', 'status'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const metaResponseTime = new Histogram({
  name: 'cube_api_meta_response_time',
  help: 'Duration of meta endpoint response in seconds',
  labelNames: ['tenant', 'extended', 'only_compiler_id', 'status'] as const,
  buckets: API_RESPONSE_BUCKETS
});

export const queryExecutionTime = new Histogram({
  name: 'cube_query_execution_time',
  help: 'Duration of actual query execution time in seconds',
  labelNames: ['tenant', 'data_source', 'external', 'status'] as const,
  buckets: QUERY_EXECUTION_BUCKETS
});
