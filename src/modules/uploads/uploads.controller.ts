import type { Request, Response } from 'express';
import { uploadImage } from '../../lib/blob';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';

export const upload = asyncHandler(async (req: Request, res: Response) => {
  const { filename, contentType, dataBase64 } = req.body as {
    filename: string;
    contentType: string;
    dataBase64: string;
  };

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataBase64, 'base64');
  } catch {
    throw ApiError.badRequest('Invalid base64 data', 'INVALID_UPLOAD');
  }

  const result = await uploadImage(buffer, filename, contentType);
  res.status(201).json({
    success: true,
    data: { url: result.url, blobKey: result.pathname },
    requestId: req.requestId,
  });
});
