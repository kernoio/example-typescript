import { TableClient, TableServiceClient } from '@azure/data-tables';
import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { QueueClient, QueueServiceClient } from '@azure/storage-queue';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING!;

const tableServiceClient = TableServiceClient.fromConnectionString(connectionString, {
  allowInsecureConnection: true,
});

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);

export function getTableClient(tableName: string): TableClient {
  return TableClient.fromConnectionString(connectionString, tableName, {
    allowInsecureConnection: true,
  });
}

export function getBlobContainerClient(containerName: string): ContainerClient {
  return blobServiceClient.getContainerClient(containerName);
}

export function getQueueClient(queueName: string): QueueClient {
  return queueServiceClient.getQueueClient(queueName);
}

export async function initializeAzureResources(): Promise<void> {
  const tables = ['users', 'articles', 'comments', 'tags', 'favorites', 'follows'];
  await Promise.all(tables.map((t) => tableServiceClient.createTable(t).catch(() => {})));

  const blobContainer = blobServiceClient.getContainerClient('uploads');
  await blobContainer.createIfNotExists();

  const queue = queueServiceClient.getQueueClient('jobs');
  await queue.createIfNotExists();
}
