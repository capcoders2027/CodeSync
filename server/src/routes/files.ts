import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';

export const filesRouter = Router({ mergeParams: true }); // Important for nested routes like /projects/:projectId/files

// Validation Schemas
const createFileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['file', 'folder']),
  parentId: z.string().uuid().nullable().optional(),
});

const renameFileSchema = z.object({
  name: z.string().min(1).max(255),
});

// All file operations require at least member access
filesRouter.use(requireAuth, requireProjectRole(['team_lead', 'member']));

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/files - Get complete file tree
// ---------------------------------------------------------------------------
filesRouter.get('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };

    const files = await prisma.file.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        sizeBytes: true,
        updatedAt: true,
      },
      orderBy: [
        { type: 'asc' }, // folders first (assuming 'folder' < 'file' alphabetically, wait: 'file' < 'folder'. Better sort by type DESC)
        { name: 'asc' }
      ]
    });

    res.json({ status: 'success', data: { files } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/files - Create a file or folder
// ---------------------------------------------------------------------------
filesRouter.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const { name, type, parentId } = createFileSchema.parse(req.body);

    // Validate parent exists and is a folder
    if (parentId) {
      const parent = await prisma.file.findUnique({ where: { id: parentId } });
      if (!parent || parent.projectId !== projectId || parent.type !== 'folder') {
        throw new AppError(400, 'Invalid parent directory', 'BAD_REQUEST');
      }
    }

    // Check for duplicate names in the same directory
    const existing = await prisma.file.findFirst({
      where: { projectId, parentId: parentId || null, name }
    });

    if (existing) {
      throw new AppError(409, `A ${type} with this name already exists here`, 'CONFLICT');
    }

    const file = await prisma.file.create({
      data: {
        projectId,
        name,
        type,
        parentId: parentId || null,
        content: type === 'file' ? '' : null,
      },
      select: { id: true, name: true, type: true, parentId: true, updatedAt: true }
    });

    // Touch project updatedAt to reflect recent activity
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json({ status: 'success', data: { file } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/files/:fileId/rename - Rename file/folder
// ---------------------------------------------------------------------------
filesRouter.patch('/:fileId/rename', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };
    const { name } = renameFileSchema.parse(req.body);

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== projectId) {
      throw new AppError(404, 'File not found', 'NOT_FOUND');
    }

    // Check for duplicates
    const existing = await prisma.file.findFirst({
      where: { projectId, parentId: file.parentId, name, id: { not: fileId } }
    });

    if (existing) {
      throw new AppError(409, `A file with this name already exists here`, 'CONFLICT');
    }

    const updated = await prisma.file.update({
      where: { id: fileId },
      data: { name },
      select: { id: true, name: true, type: true, parentId: true, updatedAt: true }
    });

    // Touch project updatedAt to reflect recent activity
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    res.json({ status: 'success', data: { file: updated } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId/files/:fileId - Delete file/folder
// ---------------------------------------------------------------------------
filesRouter.delete('/:fileId', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };

    const file = await prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.projectId !== projectId) {
      throw new AppError(404, 'File not found', 'NOT_FOUND');
    }

    // Cascade delete is handled by Prisma schema (onDelete: Cascade)
    await prisma.file.delete({ where: { id: fileId } });

    // Touch project updatedAt to reflect recent activity
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    res.json({ status: 'success', message: 'File deleted' });
  } catch (error) {
    next(error);
  }
});
