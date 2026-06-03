import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export async function executeExclusiveTransaction<T>(
  prisma: PrismaService,
  fn: (prisma: PrismaService) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    (tx) => fn(tx as unknown as PrismaService),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
