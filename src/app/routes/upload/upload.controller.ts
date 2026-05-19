import { NextFunction, Request, Response, Router } from 'express';
import { getBlobContainerClient } from '../../azure-clients';

const router = Router();

router.post('/uploads', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const blobName = `${crypto.randomUUID()}`;
    const containerClient = getBlobContainerClient('uploads');
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const data = req.body as Buffer;
    await blockBlobClient.upload(data, data.length, {
      blobHTTPHeaders: { blobContentType: req.headers['content-type'] ?? 'application/octet-stream' },
    });
    res.status(201).json({ blobName, url: blockBlobClient.url });
  } catch (error) {
    next(error);
  }
});

router.get('/uploads/:blobName', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const containerClient = getBlobContainerClient('uploads');
    const blockBlobClient = containerClient.getBlockBlobClient(req.params.blobName);
    const downloadResponse = await blockBlobClient.download(0);
    res.setHeader('content-type', downloadResponse.contentType ?? 'application/octet-stream');
    downloadResponse.readableStreamBody!.pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
