import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const notFoundHandler = (req: Request, res: Response, next: NextFunction) => {
  const error = new AppError(404, `Not Found - ${req.originalUrl}`, 'NOT_FOUND');
  next(error);
};

export const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[Error] ${err.name}: ${err.message}`);
  
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code || 'ERROR',
      message: err.message,
      ...(env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      errors: err.errors,
    });
  }

  // Handle other known errors (e.g., Prisma errors, JWT errors) here

  // Fallback for unhandled errors
  const statusCode = 500;
  const message = 'Internal Server Error';
  
  res.status(statusCode).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: env.NODE_ENV === 'production' ? message : err.message,
    ...(env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
