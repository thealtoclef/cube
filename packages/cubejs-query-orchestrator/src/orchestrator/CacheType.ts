/**
 * Enum representing the different cache types that can be used to fulfill a query.
 * Based on: https://cube.dev/docs/product/caching#cache-type
 */
export enum CacheType {
  /**
   * Pre-aggregations in Cube Store.
   * The query utilized existing pre-aggregations in Cube Store,
   * so it did not need to go to the database for processing.
   */
  PRE_AGGREGATIONS_CUBE_STORE = 'pre_aggregations_cube_store',

  /**
   * Pre-aggregations in the data source.
   * The query utilized pre-aggregations from the upstream data source.
   * These queries could gain a performance boost by using Cube Store
   * as pre-aggregation storage.
   */
  PRE_AGGREGATIONS_DATA_SOURCE = 'pre_aggregations_data_source',

  /**
   * In-memory cache.
   * The results were retrieved from Cube's in-memory LRU cache.
   * This is the fastest query retrieval method, but requires that
   * the exact same query was run very recently (within minutes).
   */
  IN_MEMORY_CACHE = 'in_memory_cache',

  /**
   * Persistent cache.
   * The results were retrieved from the persistent cache driver
   * (LocalCacheDriver or CubeStoreCacheDriver), but not from in-memory cache.
   * Faster than querying the database, but slower than in-memory cache.
   */
  PERSISTENT_CACHE = 'persistent_cache',

  /**
   * No cache.
   * The query was processed in the upstream data source and was not
   * accelerated using pre-aggregations. These queries could have a
   * significant performance boost if pre-aggregations and Cube Store
   * were utilized.
   */
  NO_CACHE = 'no_cache',
}

/**
 * Determines the cache type based on query execution metadata.
 *
 * Cube has a two-tier caching system:
 * 1. In-memory LRU cache (fastest, always present)
 * 2. Persistent cache driver (LocalCacheDriver or CubeStoreCacheDriver)
 *
 * @param options.usedPreAggregations - Map of pre-aggregations that were used
 * @param options.external - Whether the query was executed on external storage (Cube Store)
 * @param options.fromCache - Whether the result came from cache (persistent or in-memory)
 * @param options.fromInMemoryCache - Whether the result came from in-memory cache
 * @returns The cache type that was used for this query
 */
export function determineCacheType(options: {
  usedPreAggregations?: Record<string, any>;
  external?: boolean;
  fromCache?: boolean;
  fromInMemoryCache?: boolean;
}): CacheType {
  const {
    usedPreAggregations = {},
    external = false,
    fromCache = false,
    fromInMemoryCache = false,
  } = options;

  const hasPreAggregations = Object.keys(usedPreAggregations).length > 0;

  // Check cache hits first (before checking pre-aggregations)
  // because pre-aggregation queries can also be cached

  // In-memory cache hit (fastest path)
  if (fromInMemoryCache) {
    return CacheType.IN_MEMORY_CACHE;
  }

  // Persistent cache hit (cache driver - LocalCacheDriver or CubeStoreCacheDriver)
  // This means it was in the cache driver but NOT in the in-memory LRU cache
  if (fromCache && !fromInMemoryCache) {
    return CacheType.PERSISTENT_CACHE;
  }

  // Pre-aggregations in Cube Store (external)
  if (hasPreAggregations && external) {
    return CacheType.PRE_AGGREGATIONS_CUBE_STORE;
  }

  // Pre-aggregations in data source (internal)
  if (hasPreAggregations && !external) {
    return CacheType.PRE_AGGREGATIONS_DATA_SOURCE;
  }

  // No cache - query went directly to database
  return CacheType.NO_CACHE;
}
