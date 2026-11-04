import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';

export const commentsRouter = Router({ mergeParams: true }); // Mounted under /projects/:projectId/files/:fileId/comments

const createCommentSchema = z.object({
  lineNumber: z.number().int().positive().nullable().optional(),
  content: z.string().min(1).max(5000),
  parentCommentId: z.string().uuid().nullable().optional(),
});

commentsRouter.use(requireAuth, requireProjectRole(['team_lead', 'member']));

// ---------------------------------------------------------------------------
// GET - Get all comments for a file
// ---------------------------------------------------------------------------
commentsRouter.get('/', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };

    const comments = await prisma.comment.findMany({
      where: { projectId, fileId },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
        replies: {
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Filter out replies from the top level since they are included in their parents
    const topLevelComments = comments.filter((c: any) => !c.parentCommentId);

    res.json({ status: 'success', data: { comments: topLevelComments } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST - Create a comment or reply
// ---------------------------------------------------------------------------
commentsRouter.post('/', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };
    const { lineNumber, content, parentCommentId } = createCommentSchema.parse(req.body);
    const userId = req.user!.id;

    if (parentCommentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentCommentId } });
      if (!parent || parent.fileId !== fileId) {
        throw new AppError(404, 'Parent comment not found', 'NOT_FOUND');
      }
    }

    const comment = await prisma.comment.create({
      data: {
        projectId,
        fileId,
        userId,
        content,
        lineNumber: lineNumber || null,
        parentCommentId: parentCommentId || null,
      },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } }
      }
    });

    res.status(201).json({ status: 'success', data: { comment } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH - Resolve/unresolve comment thread
// ---------------------------------------------------------------------------
commentsRouter.patch('/:commentId/resolve', async (req, res, next) => {
  try {
    const { projectId, fileId, commentId } = req.params as { projectId: string, fileId: string, commentId: string };
    const { isResolved } = z.object({ isResolved: z.boolean() }).parse(req.body);

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.fileId !== fileId) {
      throw new AppError(404, 'Comment not found', 'NOT_FOUND');
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { isResolved }
    });

    res.json({ status: 'success', data: { comment: updated } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE - Delete a comment
// ---------------------------------------------------------------------------
commentsRouter.delete('/:commentId', async (req, res, next) => {
  try {
    const { projectId, fileId, commentId } = req.params as { projectId: string, fileId: string, commentId: string };
    const userId = req.user!.id;

    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment || comment.fileId !== fileId) {
      throw new AppError(404, 'Comment not found', 'NOT_FOUND');
    }

    // Only author or team lead can delete
    const member = await prisma.projectMember.findUnique({
      where: { idx_pm_project_user: { projectId, userId } }
    });

    if (comment.userId !== userId && member?.role !== 'team_lead') {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }

    await prisma.comment.delete({ where: { id: commentId } });

    res.json({ status: 'success', message: 'Comment deleted' });
  } catch (error) {
    next(error);
  }
});
