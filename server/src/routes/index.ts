import { Router } from 'express';
import { authRouter } from './auth';

import { projectsRouter } from './projects';
import { filesRouter } from './files';
import { commentsRouter } from './comments';
import { executionRouter } from './execution';
import { analysisRouter } from './analysis';
import { predictRouter } from './predict';
import { runConfigRouter } from './runConfig';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/projects/:projectId/files', filesRouter);
apiRouter.use('/projects/:projectId/files/:fileId/comments', commentsRouter);
apiRouter.use('/projects/:projectId/execute', executionRouter);
apiRouter.use('/projects/:projectId/analyze', analysisRouter);
apiRouter.use('/projects/:projectId/predict', predictRouter);
apiRouter.use('/projects/:projectId/run-config', runConfigRouter);
