import { NextFunction, Request, Response, Router } from 'express';
import { getQueueClient } from '../../azure-clients';

const router = Router();

router.post('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queueClient = getQueueClient('jobs');
    const message = Buffer.from(JSON.stringify(req.body)).toString('base64');
    const result = await queueClient.sendMessage(message);
    res.status(201).json({ messageId: result.messageId });
  } catch (error) {
    next(error);
  }
});

router.get('/jobs', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const queueClient = getQueueClient('jobs');
    const result = await queueClient.receiveMessages({ numberOfMessages: 1 });
    if (!result.receivedMessageItems.length) {
      return res.sendStatus(204);
    }
    const item = result.receivedMessageItems[0];
    const body = JSON.parse(Buffer.from(item.messageText, 'base64').toString('utf8'));
    await queueClient.deleteMessage(item.messageId, item.popReceipt);
    res.json({ messageId: item.messageId, body });
  } catch (error) {
    next(error);
  }
});

export default router;
