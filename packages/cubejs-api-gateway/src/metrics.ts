import { Histogram } from 'prom-client';

export const loadResponseTime = new Histogram({
  name: 'cube_api_load_response_time',
  help: 'Duration of load response in seconds',
  labelNames: ['tenant', 'api_type'] as const,
  buckets: [0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 90]
});

export const getSQLResultTime = new Histogram({
  name: 'cube_api_get_sql_result_time',
  help: 'Duration of get SQL result phase in seconds',
  labelNames: ['tenant', 'api_type', 'data_source', 'db_type', "ext_db_type", "external", "slow_query"] as const,
  buckets: [0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 15, 20, 25, 30, 40, 50, 60, 90]
});
