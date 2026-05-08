import { Router, Request, Response, NextFunction } from 'express';
import { publish, bulkPublish, formatEvent } from './publisher.service';

const router = Router();

router.post(
  '/publish',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await publish(req.body);
      const event = formatEvent({
        type: 'publish',
        payload: {
          orgId: req.body.orgId,
          name: req.body.name,
          timestamp: Date.now(),
        },
      });
      res.json({ result, event });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/bulk-publish',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const results = await bulkPublish(req.body);
      res.json({ results, count: results.length });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
