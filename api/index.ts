import app from '../src/app';

/**
 * Vercel serverless entry — export Express app directly (@vercel/node).
 * `vercel.json` rewrites all traffic here except /healthz.
 */
export default app;
