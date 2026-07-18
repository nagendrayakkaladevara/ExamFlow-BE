import type { Express } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import { helmetOptions } from '../config/security';

/** Apply baseline security middleware (helmet, hpp). */
export function applySecurityMiddleware(app: Express) {
  app.use(helmet(helmetOptions));
  app.use(hpp());
}
