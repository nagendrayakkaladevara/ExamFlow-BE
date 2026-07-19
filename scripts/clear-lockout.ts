import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

prisma.loginAttempt
  .deleteMany({ where: { email: 'admin@svecw.edu.in' } })
  .then((r) => console.log('cleared', r.count))
  .finally(() => prisma.$disconnect());
