import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';
import { executeCode } from '../services/execution';

export const executionRouter = Router({ mergeParams: true }); // Mounted under /projects/:projectId/execute

const executeSchema = z.object({
  entryFileId: z.string().uuid(),
});

executionRouter.use(requireAuth, requireProjectRole(['team_lead', 'member']));

// ---------------------------------------------------------------------------
// POST - Run project code
// ---------------------------------------------------------------------------
executionRouter.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const { entryFileId } = executeSchema.parse(req.body);
    const userId = req.user!.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { language: true }
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    // Fetch all files in the project
    const allFiles = await prisma.file.findMany({
      where: { projectId, type: 'file' },
      select: { id: true, name: true, content: true }
    });

    const entryFile = allFiles.find((f: any) => f.id === entryFileId);
    if (!entryFile) {
      throw new AppError(404, 'Entry file not found in project', 'NOT_FOUND');
    }

    // Determine status (we log before running if we wanted to track running status, 
    // but for synchronous request we can just run and then log).
    
    let result;
    try {
      result = await executeCode(project.language, allFiles, entryFile.name);
    } catch (err: any) {
      throw new AppError(500, `Execution engine failure: ${err.message}`, 'EXEC_ENGINE_FAILURE');
    }

    // Determine final status
    let status = 'completed';
    if (result.exitCode === 124) status = 'timeout';
    else if (result.exitCode !== 0) status = 'error';

    // Limit preview sizes to 5KB to prevent massive database bloating
    const limitString = (s: string, limit = 5000) => s.length > limit ? s.substring(0, limit) + '... (truncated)' : s;

    // Save Execution Log
    const executionLog = await prisma.executionLog.create({
      data: {
        projectId,
        userId,
        language: project.language,
        entryFile: entryFile.name,
        status,
        exitCode: result.exitCode,
        stdoutPreview: limitString(result.stdout),
        stderrPreview: limitString(result.stderr),
        durationMs: result.durationMs,
      }
    });

    res.json({
      status: 'success',
      data: {
        log: executionLog,
        // Send full output to client even if DB preview is truncated
        fullStdout: result.stdout,
        fullStderr: result.stderr,
      }
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET - Get execution history
// ---------------------------------------------------------------------------
executionRouter.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    const logs = await prisma.executionLog.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit history
    });

    res.json({ status: 'success', data: { logs } });
  } catch (error) {
    next(error);
  }
});
