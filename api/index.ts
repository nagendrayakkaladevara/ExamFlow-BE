import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

/**
 * Vercel serverless entry — explicit handler for Express on @vercel/node.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
