# Performance Monitoring with Prometheus Metrics

Cube provides comprehensive performance monitoring capabilities through Prometheus metrics integration. This feature allows you to track API response times, query performance, and system health across different tenants and endpoints.

## Overview

The performance monitoring system uses [Prometheus](https://prometheus.io/) metrics to collect and expose performance data about API requests, query execution, and system operations. All metrics include tenant information, enabling multi-tenant observability and per-tenant performance analysis.

## Available Metrics

### API Response Time Metrics

#### `cube_api_load_response_time`
Tracks the duration of load endpoint responses (data queries).

**Labels:**
- `tenant`: Tenant identifier
- `api_type`: API type (`rest`, `graphql`, etc.)

**Example:**
```
cube_api_load_response_time_bucket{tenant="tenant-a",api_type="rest",le="1"} 42
cube_api_load_response_time_bucket{tenant="tenant-a",api_type="rest",le="2.5"} 45
cube_api_load_response_time_bucket{tenant="tenant-b",api_type="rest",le="1"} 38
```

#### `cube_api_meta_response_time`
Tracks the duration of meta endpoint responses (schema introspection).

**Labels:**
- `tenant`: Tenant identifier
- `endpoint`: Endpoint name (`meta`)
- `extended`: Whether extended meta was requested (`true`/`false`)

**Example:**
```
cube_api_meta_response_time_bucket{tenant="tenant-a",endpoint="meta",extended="false",le="0.5"} 120
cube_api_meta_response_time_bucket{tenant="tenant-a",endpoint="meta",extended="true",le="1"} 95
```

#### `cube_api_dry_run_response_time`
Tracks the duration of dry-run endpoint responses (query validation).

**Labels:**
- `tenant`: Tenant identifier
- `method`: HTTP method (`GET`/`POST`)

**Example:**
```
cube_api_dry_run_response_time_bucket{tenant="tenant-a",method="POST",le="0.25"} 67
cube_api_dry_run_response_time_bucket{tenant="tenant-b",method="GET",le="0.25"} 72
```

### Query Performance Metrics

#### `cube_api_get_sql_result_time`
Tracks the duration of SQL query execution phase.

**Labels:**
- `tenant`: Tenant identifier
- `api_type`: API type
- `data_source`: Data source name
- `db_type`: Database type
- `ext_db_type`: External database type
- `external`: Whether external database was used (`true`/`false`)
- `slow_query`: Whether query was marked as slow (`true`/`false`)

**Example:**
```
cube_api_get_sql_result_time_bucket{tenant="tenant-a",api_type="rest",data_source="default",db_type="postgres",ext_db_type="",external="false",slow_query="false",le="5"} 156
cube_api_get_sql_result_time_bucket{tenant="tenant-b",api_type="rest",data_source="analytics",db_type="bigquery",ext_db_type="bigquery",external="true",slow_query="true",le="60"} 12
```

### Pre-aggregations Metrics

#### `cube_api_pre_aggregations_response_time`
Tracks the duration of pre-aggregations endpoint responses.

**Labels:**
- `tenant`: Tenant identifier
- `endpoint`: Endpoint name (`pre-aggregations-can-use`, `pre-aggregations-jobs`)

**Example:**
```
cube_api_pre_aggregations_response_time_bucket{tenant="tenant-a",endpoint="pre-aggregations-can-use",le="0.1"} 89
cube_api_pre_aggregations_response_time_bucket{tenant="tenant-b",endpoint="pre-aggregations-jobs",le="2.5"} 34
```

### CubeSQL Metrics

#### `cube_api_cubesql_response_time`
Tracks the duration of CubeSQL endpoint responses.

**Labels:**
- `tenant`: Tenant identifier

**Example:**
```
cube_api_cubesql_response_time_bucket{tenant="tenant-a",le="1"} 234
cube_api_cubesql_response_time_bucket{tenant="tenant-b",le="1"} 189
```

## Configuration

### Enabling Metrics

Metrics are automatically enabled when using the API Gateway. No additional configuration is required.

### Prometheus Integration

To expose metrics to Prometheus, you'll need to configure Prometheus to scrape the metrics endpoint. Here's an example Prometheus configuration:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'cube-api'
    static_configs:
      - targets: ['localhost:4000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

You can use these metrics to create comprehensive dashboards in Grafana. Here are some useful panel configurations:

#### Tenant Performance Overview
- **Panel Title**: API Response Times by Tenant
- **Query**: `rate(cube_api_load_response_time_sum[5m]) by (tenant)`
- **Visualization**: Time series graph

#### Query Performance Analysis
- **Panel Title**: SQL Query Duration Distribution
- **Query**: `histogram_quantile(0.95, rate(cube_api_get_sql_result_time_bucket[5m]))`
- **Visualization**: Heat map

#### Slow Query Detection
- **Panel Title**: Slow Query Rate
- **Query**: `rate(cube_api_get_sql_result_time_sum{slow_query="true"}[5m])`
- **Visualization**: Single stat

## Use Cases

### 1. Multi-tenant Performance Monitoring

Monitor performance across different tenants to identify resource usage patterns:

```promql
# Average response time by tenant
rate(cube_api_load_response_time_sum[5m]) by (tenant) /
rate(cube_api_load_response_time_count[5m]) by (tenant)
```

### 2. Performance Anomaly Detection

Identify unusual performance patterns:

```promql
# 95th percentile response time
histogram_quantile(0.95, rate(cube_api_load_response_time_bucket[5m]))
```

### 3. Resource Planning

Analyze query patterns for capacity planning:

```promql
# Query volume by tenant
rate(cube_api_load_response_time_count[5m]) by (tenant)
```

### 4. Database Performance Analysis

Monitor database-specific performance:

```promql
# Average SQL query time by data source
rate(cube_api_get_sql_result_time_sum[5m]) by (data_source, db_type) /
rate(cube_api_get_sql_result_time_count[5m]) by (data_source, db_type)
```

## Alerting Examples

### High Response Time Alert

```yaml
# alertmanager.yml
groups:
  - name: cube-api-performance
    rules:
      - alert: HighResponseTime
        expr: histogram_quantile(0.95, rate(cube_api_load_response_time_bucket[5m])) > 5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High API response time detected"
          description: "95th percentile response time is above 5 seconds for 10 minutes"
```

### High Error Rate Alert

```yaml
      - alert: HighErrorRate
        expr: rate(cube_api_load_response_time_count[5m]) > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate detected"
          description: "API error rate is above 0% for 5 minutes"
```

### Slow Query Alert

```yaml
      - alert: SlowQueries
        expr: rate(cube_api_get_sql_result_time_sum{slow_query="true"}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Slow queries detected"
          description: "Rate of slow queries is above 0.1 queries per second"
```

## Troubleshooting

### Missing Tenant Information

If tenant information shows as "unknown" in metrics:

1. Verify that your authentication configuration properly sets the tenant in the security context
2. Check that your `contextToAppId` configuration includes tenant information
3. Ensure JWT tokens contain the required tenant claims

### High Metric Cardinality

If you experience high metric cardinality:

1. Review your tenant identification strategy
2. Consider using tenant groups or categories instead of individual tenant IDs
3. Implement metric relabeling in Prometheus to group similar tenants

### Performance Impact

The metrics collection is designed to have minimal performance impact:

1. Metrics are collected asynchronously
2. No additional database queries are performed
3. Memory usage is optimized through efficient histogram bucketing

## Security Considerations

1. **Access Control**: Ensure that the metrics endpoint is properly secured and only accessible to authorized monitoring systems
2. **Data Sensitivity**: Be aware that metrics may contain tenant identifiers; consider data retention policies
3. **Network Security**: Use TLS for metric scrapes in production environments

## Integration Examples

### Docker Compose with Prometheus

```yaml
version: '3.8'
services:
  cube:
    image: cubejs/cube:latest
    environment:
      - CUBEJS_API_SECRET=your-secret
    ports:
      - "4000:4000"

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cube-api
spec:
  template:
    spec:
      containers:
      - name: cube-api
        image: cubejs/cube:latest
        ports:
        - containerPort: 4000
          name: metrics
        env:
        - name: CUBEJS_API_SECRET
          valueFrom:
            secretKeyRef:
              name: cube-secrets
              key: api-secret
---
apiVersion: v1
kind: Service
metadata:
  name: cube-api
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "4000"
    prometheus.io/path: "/metrics"
spec:
  selector:
    app: cube-api
  ports:
  - port: 4000
    targetPort: 4000
    name: metrics
```

## API Reference

### Metrics Endpoint

The metrics are exposed at the `/metrics` endpoint, which returns Prometheus-formatted metrics.

**Response Format:**
```
# TYPE cube_api_load_response_time histogram
cube_api_load_response_time_bucket{tenant="tenant-a",api_type="rest",le="0.1"} 0
cube_api_load_response_time_bucket{tenant="tenant-a",api_type="rest",le="0.25"} 1
cube_api_load_response_time_bucket{tenant="tenant-a",api_type="rest",le="0.5"} 3
...
cube_api_load_response_time_count{tenant="tenant-a",api_type="rest"} 42
cube_api_load_response_time_sum{tenant="tenant-a",api_type="rest"} 156.7
```

## Best Practices

1. **Monitor Regularly**: Set up comprehensive dashboards to monitor all available metrics
2. **Set Up Alerts**: Configure alerts for critical performance thresholds
3. **Track Trends**: Monitor performance trends over time to identify potential issues
4. **Tenant Analysis**: Regularly analyze performance patterns across different tenants
5. **Capacity Planning**: Use metrics data for capacity planning and resource optimization

## Future Enhancements

The metrics system is designed to be extensible. Future enhancements may include:

- Additional metric types for different system components
- Custom metric labels for advanced filtering
- Integration with other monitoring systems
- Advanced alerting and anomaly detection features

---

This documentation covers the performance monitoring features added to Cube's API Gateway. For more information about Cube's architecture and configuration, refer to the [main documentation](https://cube.dev/docs).