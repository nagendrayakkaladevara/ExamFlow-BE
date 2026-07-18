import { Router } from 'express';

export const healthRouter = Router();

/** GET /healthz → { ok: true, requestId } */
healthRouter.get('/', (req, res) => {
  res.status(200).json({ ok: true, requestId: req.requestId });
});
