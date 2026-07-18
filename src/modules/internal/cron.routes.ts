import { Router } from 'express';
import { requireCronSecret } from '../../middleware/requireCronSecret';
import { asyncHandler } from '../../utils/asyncHandler';
import * as cronService from './cron.service';

export const cronRouter = Router();

cronRouter.post(
  '/auto-submit',
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const result = await cronService.runAutoSubmit();
    res.status(200).json({ success: true, data: result, requestId: req.requestId });
  }),
);

cronRouter.post(
  '/publish-scheduled',
  requireCronSecret,
  asyncHandler(async (req, res) => {
    const result = await cronService.runPublishScheduled();
    res.status(200).json({ success: true, data: result, requestId: req.requestId });
  }),
);
