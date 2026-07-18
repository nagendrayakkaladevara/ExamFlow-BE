import rateLimit from 'express-rate-limit';
import { globalRateLimitOptions } from '../config/security';

export const rateLimitMiddleware = rateLimit(globalRateLimitOptions);
