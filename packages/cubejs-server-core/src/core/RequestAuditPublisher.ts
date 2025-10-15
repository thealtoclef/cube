/**
 * Request Audit Publisher for Google Pub/Sub
 *
 * Publishes request audit events (request/response) to Google Pub/Sub for compliance,
 * monitoring, and analytics purposes.
 *
 * Note: Event schema uses snake_case to match the documented public API
 */

/* eslint-disable camelcase */

import { PubSub, Topic } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
import { getEnv } from '@cubejs-backend/shared';

/**
 * Request audit event schema definitions
 */

// Request audit event interface
export interface RequestAuditEvent {
  event_id: string;
  event_type: string;
  event_created_at: string;
  request_id: string;
  api_type: string;
  query: any;
  is_playground: boolean;
  security_context: any;
  status: 'acknowledged' | 'success' | 'continue_wait' | 'error';
  // Timing fields
  start_time?: string;
  duration?: number;
  // Success fields
  query_type?: string;
  query_count?: number;
  query_with_pre_aggregations?: number;
  cache_type?: string;
  data_source?: string;
  db_type?: string;
  ext_db_type?: string;
  external?: boolean;
  last_refresh_time?: string;
  slow_query?: boolean;
  // Error field
  error?: string;
}

export interface RequestAuditPublisher {
  publishEvent(data: any, eventType?: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * No-op publisher when request audit is disabled
 */
class NoOpPublisher implements RequestAuditPublisher {
  public async publishEvent(_data: any, _eventType?: string): Promise<void> {
    // No-op
  }

  public async close(): Promise<void> {
    // No-op
  }
}

/**
 * Google Pub/Sub request audit publisher
 */
export class PubSubPublisher implements RequestAuditPublisher {
  private pubsub: PubSub;

  private topic: Topic;

  private projectId: string;

  private topicName: string;

  private maxBatchBytes?: number;

  private maxBatchEvents?: number;

  private flushIntervalMs?: number;

  public constructor(
    projectId: string,
    topicName: string,
    options?: {
      maxBatchBytes?: number;
      maxBatchEvents?: number;
      flushIntervalMs?: number;
    }
  ) {
    this.projectId = projectId;
    this.topicName = topicName;
    this.maxBatchBytes = options?.maxBatchBytes;
    this.maxBatchEvents = options?.maxBatchEvents;
    this.flushIntervalMs = options?.flushIntervalMs;

    // Initialize Pub/Sub client
    // If PUBSUB_EMULATOR_HOST is set, it will automatically use the emulator
    this.pubsub = new PubSub({
      projectId: this.projectId,
    });

    // Only set batching options if at least one is specified
    const batchingOptions: any = {};
    if (this.maxBatchBytes !== undefined) {
      batchingOptions.maxBytes = this.maxBatchBytes;
    }
    if (this.maxBatchEvents !== undefined) {
      batchingOptions.maxMessages = this.maxBatchEvents;
    }
    if (this.flushIntervalMs !== undefined) {
      batchingOptions.maxMilliseconds = this.flushIntervalMs;
    }

    this.topic = this.pubsub.topic(
      this.topicName,
      Object.keys(batchingOptions).length > 0 ? { batching: batchingOptions } : undefined
    );
  }

  public async publishEvent(data: any, eventType: string): Promise<void> {
    const event: RequestAuditEvent = {
      event_id: uuidv4(),
      event_type: eventType,
      event_created_at: new Date().toISOString(),
      request_id: data.request_id,
      api_type: data.api_type,
      query: data.query,
      is_playground: data.is_playground,
      security_context: data.security_context,
      status: data.status,
      // Timing fields
      start_time: data.start_time,
      duration: data.duration,
      // Success fields
      query_type: data.query_type,
      query_count: data.query_count,
      query_with_pre_aggregations: data.query_with_pre_aggregations,
      cache_type: data.cache_type,
      data_source: data.data_source,
      db_type: data.db_type,
      ext_db_type: data.ext_db_type,
      external: data.external,
      last_refresh_time: data.last_refresh_time,
      slow_query: data.slow_query,
      // Error field
      error: data.error,
    };
    await this.publish(event);
  }

  private async publish(event: RequestAuditEvent): Promise<void> {
    try {
      const messageBuffer = Buffer.from(JSON.stringify(event));

      // Fire and forget - don't wait for publish to complete
      this.topic.publishMessage({ data: messageBuffer }).catch((error) => {
        // Log error but don't throw - we never want audit logging to impact queries
        console.error('Request Audit PubSub Publish Error:', error.message, {
          event_type: event.event_type,
          request_id: event.request_id,
        });
      });
    } catch (error: any) {
      // Log error but don't throw
      console.error('Request Audit PubSub Publish Error:', error.message, {
        event_type: event.event_type,
        request_id: event.request_id,
      });
    }
  }

  public async close(): Promise<void> {
    await this.topic.flush();
    await this.pubsub.close();
  }

  /**
   * Static factory method to create publisher based on environment configuration
   */
  public static create(): RequestAuditPublisher {
    // Read all configuration from environment
    const projectId = getEnv('requestAuditPubSubProjectId');
    const topicName = getEnv('requestAuditPubSubTopic');
    const maxBatchBytes = getEnv('requestAuditPubSubMaxBatchBytes');
    const maxBatchEvents = getEnv('requestAuditPubSubMaxBatchEvents');
    const flushIntervalMs = getEnv('requestAuditPubSubFlushIntervalMs');

    // Request audit is disabled if either projectId or topicName are not configured
    if (!(projectId && topicName)) {
      return new NoOpPublisher();
    }

    // Parse optional batching configuration
    const options: {
      maxBatchBytes?: number;
      maxBatchEvents?: number;
      flushIntervalMs?: number;
    } = {};

    if (maxBatchBytes) {
      options.maxBatchBytes = parseInt(maxBatchBytes, 10);
    }
    if (maxBatchEvents) {
      options.maxBatchEvents = parseInt(maxBatchEvents, 10);
    }
    if (flushIntervalMs) {
      options.flushIntervalMs = parseInt(flushIntervalMs, 10);
    }

    const publisher = new PubSubPublisher(projectId, topicName, options);

    console.log('Request Audit PubSub Publisher Initialized', {
      projectId,
      topicName,
      maxBatchBytes: options.maxBatchBytes || 'default (1MB)',
      maxBatchEvents: options.maxBatchEvents || 'default (100)',
      flushIntervalMs: options.flushIntervalMs || 'default (10ms)',
      emulator: process.env.PUBSUB_EMULATOR_HOST || 'none',
    });

    return publisher;
  }
}
