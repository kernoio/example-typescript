import { NextFunction, Request, Response, Router } from 'express';
import auth from '../auth/auth';
import getTags from './tag.service';

const router = Router();

/**
 * Get top 10 popular tags
 * @auth optional
 * @route {GET} /api/tags
 * @returns tags list of tag names
 */
router.get('/tags', auth.optional, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tags = await getTags();
    res.json({ tags });
  } catch (error) {
    next(error);
  }
});

export default router;
