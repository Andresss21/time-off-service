import { PrismaService } from './prisma.service';

export async function executeExclusiveTransaction<T>(
  prisma: PrismaService,
  fn: (prisma: PrismaService) => Promise<T>,
): Promise<T> {
  await prisma.$executeRawUnsafe('BEGIN EXCLUSIVE TRANSACTION');
  try {
    const result = await fn(prisma);
    await prisma.$executeRawUnsafe('COMMIT');
    return result;
  } catch (error) {
    await prisma.$executeRawUnsafe('ROLLBACK');
    throw error;
  }
}
