import express from 'express';
import cors from 'cors';
import * as bodyParser from 'body-parser';
import routes from './app/routes/routes';
import HttpException from './app/models/http-exception.model';
import { initializeAzureResources } from './app/azure-clients';

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: '*/*', limit: '50mb' }));
app.use(routes);

app.use(express.static(__dirname + '/assets'));

app.get('/', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'API is running on /api' });
});

app.use(
  (
    err: Error | HttpException,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // @ts-ignore
    if (err && err.name === 'UnauthorizedError') {
      return res.status(401).json({
        status: 'error',
        message: 'missing authorization credentials',
      });
      // @ts-ignore
    } else if (err && err.errorCode) {
      // @ts-ignore
      res.status(err.errorCode).json(err.message);
    } else if (err) {
      res.status(500).json(err.message);
    }
  },
);

const PORT = process.env.PORT || 3000;

async function start() {
  await initializeAzureResources();
  app.listen(PORT, () => {
    console.info(`server up on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
