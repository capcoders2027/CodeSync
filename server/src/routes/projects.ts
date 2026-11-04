import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { AppError } from '../middleware/error';
import { requireAuth } from '../middleware/auth';
import { requireProjectRole } from '../middleware/role';
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
  role: z.enum(['team_lead', 'member']).default('member'),
  permissions: z.object({
    can_trigger_analysis: z.boolean().default(false),
    can_view_analysis: z.boolean().default(false),
  }).default({}),
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
// GET /api/projects/:projectId - Get project details
// ---------------------------------------------------------------------------
projectsRouter.get('/:projectId', requireProjectRole(['team_lead', 'member']), async (req, res, next) => {
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
// POST /api/projects/:projectId/members - Invite a member
// ---------------------------------------------------------------------------
projectsRouter.post('/:projectId/members', requireProjectRole(['team_lead']), async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, role, permissions } = inviteMemberSchema.parse(req.body);
    const inviterId = req.user!.id;

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
        permissions,
        invitedById: inviterId,
        invitationStatus: 'pending',
      },
      include: {
        user: { select: { id: true, displayName: true, email: true, avatarUrl: true } }
      }
    });

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
      role: z.enum(['team_lead', 'member']).optional(),
      permissions: z.record(z.boolean()).optional(),
    });
    const updates = updateSchema.parse(req.body);

    const member = await prisma.projectMember.findUnique({
      where: { idx_pm_project_user: { projectId, userId } }
    });

    if (!member) {
      throw new AppError(404, 'Member not found', 'NOT_FOUND');
    }

    const updatedMember = await prisma.projectMember.update({
      where: { id: member.id },
      data: updates,
    });

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
