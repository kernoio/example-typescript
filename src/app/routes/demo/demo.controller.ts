import { Router, Request, Response } from 'express';
import prisma from '../../../../prisma/prisma-client';
import { Kafka } from 'kafkajs';
import { createClient } from 'redis';

const router = Router();

type DemoResultEnum = 'success' | 'fail' | 'partial_success';

router.get('/demo', async (_req: Request, res: Response) => {
    const result: any = { postgres: { result: 'fail' as DemoResultEnum }, redis: { result: 'fail' as DemoResultEnum }, kafka: { result: 'fail' as DemoResultEnum } };

    // POSTGRES: simple CRUD on Tag
    try {
        const rnd = Math.random().toString(36).slice(2, 8);
        const name1 = `demo-${rnd}`;
        const name2 = `${name1}-updated`;

        const created = await prisma.tag.create({ data: { name: name1 } });
        const read = await prisma.tag.findUnique({ where: { id: created.id } });
        const updated = await prisma.tag.update({ where: { id: created.id }, data: { name: name2 } });
        const deleted = await prisma.tag.delete({ where: { id: created.id } });

        result.postgres = {
            result: 'success' as DemoResultEnum,
            created,
            read,
            updated,
            deleted,
        };
    } catch (e: any) {
        result.postgres = { result: 'fail' as DemoResultEnum, error: e?.message || String(e) };
    }

    // REDIS: write then read
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const client = createClient({ url: redisUrl });
        await client.connect();
        const key = `demo:key:${Date.now()}`;
        const value = `value-${Math.random().toString(36).slice(2, 6)}`;
        await client.set(key, value, { EX: 30 });
        const readBack = await client.get(key);
        await client.quit();
        const redisResult: DemoResultEnum = readBack === value ? 'success' : 'partial_success';
        result.redis = { result: redisResult, key, value, readBack };
    } catch (e: any) {
        result.redis = { result: 'fail' as DemoResultEnum, error: e?.message || String(e) };
    }

    // KAFKA: produce then consume from topic
    try {
        const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',').map((b) => b.trim()).filter(Boolean);
        const topic = process.env.KAFKA_TOPIC || 'demo-topic';
        const kafka = new Kafka({ clientId: 'demo-client', brokers });

        // Ensure topic exists and has a leader before producing/consuming
        const admin = kafka.admin();
        try {
          await admin.connect();
          // Try to create the topic; if it already exists, ignore the error
          await admin.createTopics({
            topics: [
              {
                topic,
                numPartitions: 1,
                replicationFactor: 1,
              },
            ],
            waitForLeaders: true,
          });
        } catch (err: any) {
          // If the topic already exists, KafkaJS will return false or throw; we can safely ignore
          // Other errors will be surfaced later when producing/consuming
        } finally {
          await admin.disconnect().catch(() => void 0);
        }

        const producer = kafka.producer();
        const groupId = `demo-group-${Math.random().toString(36).slice(2, 10)}`;
        const consumer = kafka.consumer({ groupId });

        await producer.connect();
        await consumer.connect();
        await consumer.subscribe({ topic, fromBeginning: true });

        const correlationId = `cid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const producedValue = JSON.stringify({ hello: 'world', correlationId });
        await producer.send({ topic, messages: [{ key: correlationId, value: producedValue }] });

        let consumed: any | undefined = undefined;
        try {
          consumed = await new Promise<any>((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('Kafka consume timeout')), 5000);
            consumer.run({
              eachMessage: async ({ message }) => {
                const key = message.key?.toString();
                if (key === correlationId) {
                  clearTimeout(to);
                  resolve({
                    key,
                    value: message.value?.toString(),
                    partition: (message as any).partition,
                    offset: message.offset,
                  });
                }
              },
            }).catch(reject);
          });
        } catch (consumeErr: any) {
          // treat as partial success; we produced but could not consume in time
        }

        await consumer.disconnect();
        await producer.disconnect();

        const kafkaResult: DemoResultEnum = consumed ? 'success' : 'partial_success';
        result.kafka = { result: kafkaResult, topic, produced: producedValue, consumed };
    } catch (e: any) {
        result.kafka = { result: 'fail' as DemoResultEnum, error: e?.message || String(e) };
    }

    return res.json({ ok: true, result });
});

export default router;