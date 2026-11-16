import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole, getDefaultPermissions } from '../middleware/role';
import { sendProjectInvitationEmail } from '../utils/email';

export const projectsRouter = Router();

// Validation Schemas
const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  language: z.enum(['python', 'java', 'javascript', 'typescript']),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['team_lead', 'developer', 'tester', 'member', 'viewer']).default('member'),
  permissions: z.record(z.boolean()).optional(),
});

// All project routes require authentication
projectsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/projects - List user's projects
// ---------------------------------------------------------------------------
projectsRouter.get('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
        isArchived: false,
      },
      include: {
        owner: { select: { id: true, displayName: true } },
        members: { where: { invitationStatus: 'accepted' }, select: { userId: true } },
        _count: { select: { members: { where: { invitationStatus: 'accepted' } }, analyses: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ status: 'success', data: { projects } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects - Create a new project
// ---------------------------------------------------------------------------
projectsRouter.post('/', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { name, description, language } = createProjectSchema.parse(req.body);

    const project = await prisma.$transaction(async (tx: any) => {
      // 1. Create Project
      const newProject = await tx.project.create({
        data: {
          name,
          description,
          language,
          ownerId: userId,
        },
      });

      // 2. Add owner as Team Lead implicitly in members table
      await tx.projectMember.create({
        data: {
          projectId: newProject.id,
          userId,
          role: 'team_lead',
          invitationStatus: 'accepted',
          joinedAt: new Date(),
          permissions: {
            can_trigger_analysis: true,
            can_view_analysis: true,
          },
        },
      });

      return newProject;
    });

    res.status(201).json({ status: 'success', data: { project } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/projects/:projectId - Get project details
// ---------------------------------------------------------------------------
projectsRouter.get('/:projectId', requireProjectRole(['team_lead', 'developer', 'tester', 'member', 'viewer']), async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: { id: true, displayName: true } },
        members: {
          include: {
            user: { select: { id: true, displayName: true, email: true, avatarUrl: true } }
          }
        },
      },
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    // Auto-accept pending invitation when member opens the project
    await prisma.projectMember.updateMany({
      where: { projectId, userId: req.user!.id, invitationStatus: 'pending' },
      data: { invitationStatus: 'accepted', joinedAt: new Date() },
    });

    res.json({ status: 'success', data: { project } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/history - Get chronological project activity & versions
// ---------------------------------------------------------------------------
projectsRouter.get('/:projectId/history', requireProjectRole(['team_lead', 'developer', 'tester', 'member', 'viewer']), async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(50, parseInt(req.query.limit as string || '20', 10));
    const skip = (page - 1) * limit;

    const [activities, totalCount, versions] = await Promise.all([
      prisma.activityLog.findMany({
        where: { projectId },
        include: {
          user: { select: { id: true, displayName: true, email: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where: { projectId } }),
      prisma.version.findMany({
        where: { projectId },
        include: {
          createdBy: { select: { id: true, displayName: true } },
          changeStats: true,
          _count: { select: { files: true } },
        },
        orderBy: { versionNumber: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      status: 'success',
      data: {
        activities,
        versions,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/members - Invite a member
// ---------------------------------------------------------------------------
projectsRouter.post('/:projectId/members', requireProjectRole(['team_lead']), async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, role, permissions } = inviteMemberSchema.parse(req.body);
    const inviterId = req.user!.id;

    const effectivePermissions = {
      ...getDefaultPermissions(role),
      ...(permissions || {}),
    };

    // Fetch existing user or create a placeholder for new invitee
    let userToInvite = await prisma.user.findUnique({ where: { email } });
    let isNewUser = false;

    if (!userToInvite) {
      isNewUser = true;
      userToInvite = await prisma.user.create({
        data: {
          email,
          displayName: email.split('@')[0],
          passwordHash: 'INVITED_USER_PENDING',
          emailVerified: false,
        },
      });
    }

    if (userToInvite.id === inviterId) {
      throw new AppError(400, 'You cannot invite yourself', 'BAD_REQUEST');
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: { idx_pm_project_user: { projectId, userId: userToInvite.id } }
    });

    if (existingMember) {
      throw new AppError(409, 'User is already a member or invited', 'ALREADY_MEMBER');
    }

    const member = await prisma.projectMember.create({
      data: {
        projectId,
        userId: userToInvite.id,
        role,
        permissions: effectivePermissions,
        invitedById: inviterId,
        invitationStatus: 'pending',
      },
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } }
      }
    });

    await prisma.activityLog.create({
      data: {
        projectId,
        userId: inviterId,
        action: 'member_invited',
        entityType: 'member',
        entityId: member.id,
        metadata: { email, role },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

    // Send project invitation email asynchronously
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { displayName: true } });

    sendProjectInvitationEmail(
      email,
      project?.name || 'Project',
      inviter?.displayName || 'Team Lead',
      projectId,
      role,
      isNewUser
    ).catch(err => console.error('[Invite Email Error]', err));

    res.status(201).json({ status: 'success', data: { member }, message: 'Invitation sent' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/members/:userId - Update member role/permissions
// ---------------------------------------------------------------------------
projectsRouter.patch('/:projectId/members/:userId', requireProjectRole(['team_lead']), async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;
    const updateSchema = z.object({
      role: z.enum(['team_lead', 'developer', 'tester', 'member', 'viewer']).optional(),
      permissions: z.record(z.boolean()).optional(),
    });
    const updates = updateSchema.parse(req.body);

    const member = await prisma.projectMember.findUnique({
      where: { idx_pm_project_user: { projectId, userId } }
    });

    if (!member) {
      throw new AppError(404, 'Member not found', 'NOT_FOUND');
    }

    const effectivePermissions = updates.role
      ? { ...getDefaultPermissions(updates.role), ...(updates.permissions || {}) }
      : updates.permissions;

    const updatedMember = await prisma.projectMember.update({
      where: { id: member.id },
      data: {
        ...(updates.role ? { role: updates.role } : {}),
        ...(effectivePermissions ? { permissions: effectivePermissions } : {}),
      },
    });

    await prisma.activityLog.create({
      data: {
        projectId,
        userId: req.user!.id,
        action: 'member_updated',
        entityType: 'member',
        entityId: member.id,
        metadata: { targetUserId: userId, newRole: updates.role },
      },
    }).catch(err => console.error('[ActivityLog Error]', err));

    res.json({ status: 'success', data: { member: updatedMember } });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId/members/:userId - Remove member
// ---------------------------------------------------------------------------
projectsRouter.delete('/:projectId/members/:userId', requireProjectRole(['team_lead']), async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;
    
    // Check if removing owner
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (project?.ownerId === userId) {
      throw new AppError(400, 'Cannot remove project owner', 'BAD_REQUEST');
    }

    await prisma.projectMember.delete({
      where: { idx_pm_project_user: { projectId, userId } }
    });

    res.json({ status: 'success', message: 'Member removed' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/invitations/:projectId/accept
// ---------------------------------------------------------------------------
projectsRouter.post('/invitations/:projectId/accept', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;

    const member = await prisma.projectMember.findUnique({
      where: { idx_pm_project_user: { projectId, userId } }
    });

    if (!member || member.invitationStatus !== 'pending') {
      throw new AppError(404, 'No pending invitation found', 'NOT_FOUND');
    }

    await prisma.projectMember.update({
      where: { id: member.id },
      data: {
        invitationStatus: 'accepted',
        joinedAt: new Date(),
      }
    });

    res.json({ status: 'success', message: 'Invitation accepted' });
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:projectId - Delete project (Owner only)
// ---------------------------------------------------------------------------
projectsRouter.delete('/:projectId', requireProjectRole(['team_lead']), async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true, name: true },
    });

    if (!project) {
      throw new AppError(404, 'Project not found', 'NOT_FOUND');
    }

    if (project.ownerId !== userId) {
      throw new AppError(403, 'Forbidden: Only the project owner can delete this project', 'FORBIDDEN');
    }

    // Prisma schema specifies onDelete: Cascade on all Project relations
    await prisma.project.delete({
      where: { id: projectId },
    });

    res.json({ status: 'success', message: `Project '${project.name}' deleted successfully` });
  } catch (error) {
    next(error);
  }
});
