import app from '../src/app';

/**
 * Vercel serverless entry — export Express app directly (@vercel/node).
 * `vercel.json` routes all traffic here except /healthz.
 */
export default app;
