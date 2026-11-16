import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';

export const filesRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit per file
});

// Validation Schemas
const createFileSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['file', 'folder']),
  parentId: z.string().uuid().nullable().optional().or(z.literal('')).transform(val => (val === '' ? null : val)),
  content: z.string().optional(),
});

const renameFileSchema = z.object({
  name: z.string().min(1).max(255),
});

// All file operations require at least member access
filesRouter.use(requireAuth, requireProjectRole(['team_lead', 'developer', 'tester', 'member']));

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
        { type: 'desc' }, // 'folder' > 'file' alphabetically, so folders always sort first
        { name: 'asc' }
      ]
    });

    res.json({ status: 'success', data: { files } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/files - Create a file or folder (supports nested paths)
// ---------------------------------------------------------------------------
filesRouter.post('/', async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const { name, type, parentId } = createFileSchema.parse(req.body);

    // Validate parent exists and is a folder if specified
    let targetParentId = parentId || null;
    if (targetParentId) {
      const parent = await prisma.file.findUnique({ where: { id: targetParentId } });
      if (!parent || parent.projectId !== projectId || parent.type !== 'folder') {
        throw new AppError(400, 'Invalid parent directory', 'BAD_REQUEST');
      }
    }

    // Support nested path creation (e.g. 'subfolder/inner' or 'utils/helpers.ts')
    const rawPath = name.replace(/\\/g, '/');
    const segments = rawPath.split('/').filter(Boolean);

    if (segments.length === 0) {
      throw new AppError(400, 'Name cannot be empty', 'BAD_REQUEST');
    }

    let currentParentId = targetParentId;

    if (type === 'folder') {
      // Create all folder segments in sequence
      let lastFolder: any = null;
      for (const seg of segments) {
        let folder = await prisma.file.findFirst({
          where: { projectId, parentId: currentParentId, name: seg, type: 'folder' }
        });
        if (!folder) {
          folder = await prisma.file.create({
            data: {
              projectId,
              parentId: currentParentId,
              name: seg,
              type: 'folder'
            }
          });
        }
        currentParentId = folder.id;
        lastFolder = folder;
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { updatedAt: new Date() },
      });

      return res.status(201).json({ status: 'success', data: { file: lastFolder } });
    }

    // For files: create intermediate folders if path contains slashes
    const folderSegments = segments.slice(0, segments.length - 1);
    const leafFileName = segments[segments.length - 1];

    for (const folderName of folderSegments) {
      let folder = await prisma.file.findFirst({
        where: { projectId, parentId: currentParentId, name: folderName, type: 'folder' }
      });
      if (!folder) {
        folder = await prisma.file.create({
          data: {
            projectId,
            parentId: currentParentId,
            name: folderName,
            type: 'folder'
          }
        });
      }
      currentParentId = folder.id;
    }

    // Check for duplicate in the final target directory
    const existing = await prisma.file.findFirst({
      where: { projectId, parentId: currentParentId, name: leafFileName }
    });

    if (existing) {
      throw new AppError(409, `A file with name "${leafFileName}" already exists in this folder`, 'CONFLICT');
    }

    const file = await prisma.file.create({
      data: {
        projectId,
        name: leafFileName,
        type: 'file',
        parentId: currentParentId,
        content: req.body.content || '',
      },
      select: { id: true, name: true, type: true, parentId: true, updatedAt: true }
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'file_created',
        entityType: 'file',
        entityId: file.id,
        metadata: { name: file.name, type: file.type, parentId: currentParentId },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

    // Touch project updatedAt
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
// GET /api/projects/:projectId/files/:fileId - Get single file with content
// ---------------------------------------------------------------------------
filesRouter.get('/:fileId', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: { id: true, name: true, type: true, parentId: true, content: true, updatedAt: true, sizeBytes: true }
    });

    if (!file || file.type !== 'file') {
      throw new AppError(404, 'File not found', 'NOT_FOUND');
    }

    res.json({ status: 'success', data: { file } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PUT /api/projects/:projectId/files/:fileId - Save/update file content
// ---------------------------------------------------------------------------
filesRouter.put('/:fileId', async (req, res, next) => {
  try {
    const { projectId, fileId } = req.params as { projectId: string, fileId: string };
    const { content } = z.object({ content: z.string() }).parse(req.body);

    const existingFile = await prisma.file.findUnique({ where: { id: fileId } });
    if (!existingFile || existingFile.projectId !== projectId) {
      throw new AppError(404, 'File not found', 'NOT_FOUND');
    }

    const updated = await prisma.file.update({
      where: { id: fileId },
      data: {
        content,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
      },
      select: { id: true, name: true, updatedAt: true, sizeBytes: true }
    });

    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'file_updated',
        entityType: 'file',
        entityId: fileId,
        metadata: { name: existingFile.name },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

    res.json({ status: 'success', data: { file: updated } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/files/upload - Bulk file & folder upload
// ---------------------------------------------------------------------------
filesRouter.post('/upload', upload.array('files', 100), async (req, res, next) => {
  try {
    const { projectId } = req.params as { projectId: string };
    const uploadedFiles = req.files as Express.Multer.File[];

    if (!uploadedFiles || uploadedFiles.length === 0) {
      throw new AppError(400, 'No files uploaded', 'BAD_REQUEST');
    }

    let relativePaths: string[] = [];
    if (req.body.paths) {
      try {
        relativePaths = typeof req.body.paths === 'string' ? JSON.parse(req.body.paths) : req.body.paths;
      } catch {
        relativePaths = [];
      }
    }

    const createdFiles: any[] = [];
    const folderCache = new Map<string, string>(); // relativeFolderPath -> folderId

    for (let i = 0; i < uploadedFiles.length; i++) {
      const uploadFile = uploadedFiles[i];
      const relPath = (relativePaths[i] || uploadFile.originalname).replace(/\\/g, '/');
      const segments = relPath.split('/').filter(Boolean);

      let currentParentId: string | null = null;
      let folderPathAccumulator = '';

      // Traverse or create folder hierarchy
      for (let s = 0; s < segments.length - 1; s++) {
        const folderName = segments[s];
        folderPathAccumulator = folderPathAccumulator ? `${folderPathAccumulator}/${folderName}` : folderName;

        if (folderCache.has(folderPathAccumulator)) {
          currentParentId = folderCache.get(folderPathAccumulator)!;
        } else {
          // Look up or create folder in DB
          let folder = await prisma.file.findFirst({
            where: {
              projectId,
              parentId: currentParentId,
              name: folderName,
              type: 'folder',
            },
          });

          if (!folder) {
            folder = await prisma.file.create({
              data: {
                projectId,
                parentId: currentParentId,
                name: folderName,
                type: 'folder',
              },
            });
          }

          currentParentId = folder.id;
          folderCache.set(folderPathAccumulator, folder.id);
        }
      }

      // Leaf file
      const originalFileName = segments[segments.length - 1] || uploadFile.originalname;
      const finalFileName = originalFileName;

      const ext = path.extname(originalFileName).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'].includes(ext) || (uploadFile.mimetype && uploadFile.mimetype.startsWith('image/'));
      const isBinary = isImage || ['.pdf', '.zip', '.tar', '.gz', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3'].includes(ext);

      let fileContent: string;
      if (isImage) {
        const mime = uploadFile.mimetype || (ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`);
        fileContent = `data:${mime};base64,${uploadFile.buffer.toString('base64')}`;
      } else if (isBinary) {
        fileContent = `data:${uploadFile.mimetype || 'application/octet-stream'};base64,${uploadFile.buffer.toString('base64')}`;
      } else {
        // Text / code file - sanitize null bytes for PostgreSQL text column compatibility
        fileContent = uploadFile.buffer.toString('utf8').replace(/\0/g, '');
      }

      // Check for existing file in the destination folder
      const existingFile = await prisma.file.findFirst({
        where: {
          projectId,
          parentId: currentParentId,
          name: finalFileName,
        },
      });

      if (existingFile) {
        const updated = await prisma.file.update({
          where: { id: existingFile.id },
          data: {
            content: fileContent,
            sizeBytes: uploadFile.size,
            mimeType: uploadFile.mimetype || (isImage ? 'image/png' : 'text/plain'),
            updatedAt: new Date(),
          },
        });
        createdFiles.push(updated);
      } else {
        const created = await prisma.file.create({
          data: {
            projectId,
            parentId: currentParentId,
            name: finalFileName,
            type: 'file',
            content: fileContent,
            sizeBytes: uploadFile.size,
            mimeType: uploadFile.mimetype || (isImage ? 'image/png' : 'text/plain'),
          },
        });
        createdFiles.push(created);
      }
    }

    // Touch project updatedAt
    await prisma.project.update({
      where: { id: projectId },
      data: { updatedAt: new Date() },
    });

    // Log Activity
    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'files_uploaded',
        entityType: 'project',
        metadata: {
          fileCount: createdFiles.length,
          files: createdFiles.map(f => f.name).slice(0, 5),
        },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

    res.status(201).json({
      status: 'success',
      data: { files: createdFiles, count: createdFiles.length },
      message: `Successfully uploaded ${createdFiles.length} file(s).`,
    });
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

    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'file_renamed',
        entityType: 'file',
        entityId: fileId,
        metadata: { oldName: file.name, newName: name },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

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

    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'file_deleted',
        entityType: 'file',
        entityId: fileId,
        metadata: { name: file.name, type: file.type },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

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
