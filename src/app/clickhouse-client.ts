import { createClient } from '@clickhouse/client';

const client = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'test_user',
  password: process.env.CLICKHOUSE_PASSWORD || 'test_password',
});

export const initClickHouse = async (): Promise<void> => {
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS users (
      id UInt32,
      email String,
      username String,
      password String,
      image Nullable(String) DEFAULT 'https://api.realworld.io/images/smiley-cyrus.jpeg',
      bio Nullable(String),
      demo UInt8 DEFAULT 0,
      version UInt64
    ) ENGINE = ReplacingMergeTree(version)
    ORDER BY id`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS articles (
      id UInt32,
      slug String,
      title String,
      description String,
      body String,
      createdAt DateTime DEFAULT now(),
      updatedAt DateTime DEFAULT now(),
      authorId UInt32,
      version UInt64
    ) ENGINE = ReplacingMergeTree(version)
    ORDER BY id`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS comments (
      id UInt32,
      createdAt DateTime DEFAULT now(),
      updatedAt DateTime DEFAULT now(),
      body String,
      articleId UInt32,
      authorId UInt32,
      version UInt64
    ) ENGINE = ReplacingMergeTree(version)
    ORDER BY id`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS tags (
      id UInt32,
      name String,
      version UInt64
    ) ENGINE = ReplacingMergeTree(version)
    ORDER BY id`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS article_tags (
      articleId UInt32,
      tagId UInt32
    ) ENGINE = MergeTree()
    ORDER BY (articleId, tagId)`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS favorites (
      userId UInt32,
      articleId UInt32
    ) ENGINE = MergeTree()
    ORDER BY (userId, articleId)`,
  });

  await client.command({
    query: `CREATE TABLE IF NOT EXISTS follows (
      followerId UInt32,
      followingId UInt32
    ) ENGINE = MergeTree()
    ORDER BY (followerId, followingId)`,
  });
};

export default client;
