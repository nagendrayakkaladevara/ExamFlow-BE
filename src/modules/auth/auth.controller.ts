import type { Request, Response } from 'express';
import { REFRESH_COOKIE_NAME, clearRefreshCookie, setRefreshCookie } from '../../lib/cookies';
import { asyncHandler } from '../../utils/asyncHandler';
import type { ApiSuccessResponse } from '../../types/api';
import * as authService from './auth.service';

function clientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.ip;
}

function success<T>(req: Request, res: Response, data: T, status = 200) {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    requestId: req.requestId,
  };
  res.status(status).json(body);
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(
    req.body,
    clientIp(req),
    req.headers['user-agent'],
  );

  setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);

  success(req, res, {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!refreshToken) {
    clearRefreshCookie(res);
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Refresh token missing',
      },
      requestId: req.requestId,
    });
    return;
  }

  const result = await authService.refresh(refreshToken);
  setRefreshCookie(res, result.refreshToken, result.refreshMaxAgeSeconds);

  success(req, res, {
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  await authService.logout(refreshToken);
  clearRefreshCookie(res);
  success(req, res, { message: 'Logged out' });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.changePassword(req.user!.id, req.body);
  clearRefreshCookie(res);
  success(req, res, { message: 'Password changed successfully' });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  await authService.resetPassword(req.body);
  success(req, res, { message: 'Password reset successfully' });
});
