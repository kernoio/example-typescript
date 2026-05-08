import prisma from '../../../../prisma/prisma-client';

export async function publish({
  orgId,
  name,
  description,
}: {
  orgId: string;
  name: string;
  description: string;
}) {
  return prisma.user.create({
    data: {
      username: `${orgId}-${name}`,
      email: `${name}@${orgId}.example.com`,
      password: description,
    },
  });
}

export async function bulkPublish({
  orgId,
  items,
}: {
  orgId: string;
  items: Array<{
    name: string;
    description: string;
    tags: string[];
  }>;
}) {
  const results = [];
  for (const item of items) {
    const result = await publish({
      orgId,
      name: item.name,
      description: item.description,
    });
    results.push(result);
  }
  return results;
}

export type PublishEvent = {
  type: 'publish';
  payload: {
    orgId: string;
    name: string;
    timestamp: number;
  };
};

export type BulkPublishEvent = {
  type: 'bulk-publish';
  payload: {
    orgId: string;
    count: number;
    items: Array<{
      name: string;
      status: 'pending' | 'published' | 'failed';
    }>;
  };
};

export function formatEvent({
  type,
  payload,
}: PublishEvent | BulkPublishEvent): string {
  return `[${type}] org=${
    payload.orgId
  } at ${
    'timestamp' in payload ? payload.timestamp : Date.now()
  }`;
}
