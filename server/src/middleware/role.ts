import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { AppError } from './error';

/**
 * Middleware to check if the authenticated user has a specific role or permission within a project.
 * Assumes req.user is set (use requireAuth before this).
 * Assumes the project ID is available in req.params.projectId or req.body.projectId.
 */
export const requireProjectRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      const projectId = req.params.projectId || req.body.projectId;
      if (!projectId) {
        throw new AppError(400, 'Project ID is required for role verification', 'BAD_REQUEST');
      }

      const member = await prisma.projectMember.findUnique({
        where: {
          idx_pm_project_user: {
            projectId,
            userId,
          },
        },
      });

      if (!member) {
        throw new AppError(403, 'Forbidden: You are not a member of this project', 'FORBIDDEN');
      }

      if (!allowedRoles.includes(member.role)) {
        throw new AppError(403, 'Forbidden: Insufficient project role', 'FORBIDDEN');
      }

      // Attach member info to request for subsequent handlers if needed
      (req as any).projectMember = member;
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const requireProjectPermission = (permissionKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
      }

      const projectId = req.params.projectId || req.body.projectId;
      if (!projectId) {
        throw new AppError(400, 'Project ID is required for permission verification', 'BAD_REQUEST');
      }

      const member = await prisma.projectMember.findUnique({
        where: {
          idx_pm_project_user: {
            projectId,
            userId,
          },
        },
      });

      if (!member) {
        throw new AppError(403, 'Forbidden: You are not a member of this project', 'FORBIDDEN');
      }

      // Team leads implicitly have all permissions
      if (member.role === 'team_lead') {
        (req as any).projectMember = member;
        return next();
      }

      const permissions = member.permissions as Record<string, boolean>;
      if (!permissions || !permissions[permissionKey]) {
        throw new AppError(403, `Forbidden: Missing required permission '${permissionKey}'`, 'FORBIDDEN');
      }

      (req as any).projectMember = member;
      next();
    } catch (error) {
      next(error);
    }
  };
};
