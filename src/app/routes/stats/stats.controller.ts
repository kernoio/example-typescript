import { NextFunction, Request, Response, Router } from 'express';
import auth from '../auth/auth';
import getTags from '../tag/tag.service';

const router = Router();

/**
 * Count the popular tags
 * @auth optional
 * @route {GET} /api/stats/tags
 * @returns count number of popular tags
 */
router.get('/stats/tags', auth.optional, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await getTags(req.auth?.user?.id);
    res.json({ count: tags.length });
  } catch (error) {
    next(error);
  }
});

export default router;
