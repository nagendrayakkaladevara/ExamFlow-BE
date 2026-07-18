import { put } from '@vercel/blob';
import { env } from '../config/env';
import { ApiError } from '../utils/ApiError';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface UploadedBlob {
  url: string;
  pathname: string;
}

export async function uploadImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<UploadedBlob> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw ApiError.internal('Blob storage is not configured', 'BLOB_NOT_CONFIGURED');
  }
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    throw ApiError.badRequest('Unsupported file type', 'INVALID_MIME_TYPE');
  }
  if (buffer.length > MAX_BYTES) {
    throw ApiError.badRequest('File exceeds 5MB limit', 'FILE_TOO_LARGE');
  }

  const blob = await put(`uploads/${Date.now()}-${filename}`, buffer, {
    access: 'public',
    token: env.BLOB_READ_WRITE_TOKEN,
    contentType,
  });

  return { url: blob.url, pathname: blob.pathname };
}
