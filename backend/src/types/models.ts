// Backend model type definitions
// Re-export shared types (will be available once shared package is built)
// export * from 'chicken-scratch-shared/types/models';

// Additional backend-specific model types
export interface DatabaseConnection {
  query: (text: string, params?: any[]) => Promise<any>;
  release: () => void;
}

export interface RedisConnection {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, ttl?: number) => Promise<void>;
  del: (key: string) => Promise<void>;
}