import 'dotenv/config';
import { UserRole } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { hashPassword } from '../src/lib/password';

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@examflow.local').toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!@#';

async function main() {
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      firstName: 'System',
      lastName: 'Admin',
      isActive: true,
      deletedAt: null,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      role: UserRole.ADMIN,
      firstName: 'System',
      lastName: 'Admin',
      isActive: true,
    },
  });

  console.log(`Seeded admin user: ${admin.email} (${admin.id})`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
