import jwt, { Secret, SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
}

export const generateTokens = (userId: string) => {
  const payload: TokenPayload = { userId };
  
  const accessOpts: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRY as any };
  const refreshOpts: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRY as any };
  
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET as Secret, accessOpts);
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET as Secret, refreshOpts);
  
  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET as Secret) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET as Secret) as TokenPayload;
};
