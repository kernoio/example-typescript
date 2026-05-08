export interface Publisher {
  id: number;
  orgId: string;
  name: string;
  description: string;
  createdAt: Date;
}

export interface PublishConfig {
  maxRetries: number;
  timeout: number;
  metadata: {
    source: string;
    version: string;
    environment: 'development' | 'staging' | 'production';
  };
}

export function createDefaultConfig({
  source,
  version,
  environment,
}: {
  source: string;
  version: string;
  environment: 'development' | 'staging' | 'production';
}): PublishConfig {
  return {
    maxRetries: 3,
    timeout: 5000,
    metadata: {
      source,
      version,
      environment,
    },
  };
}
