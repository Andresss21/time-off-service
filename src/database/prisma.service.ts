import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
    // PRAGMA journal_mode=WAL returns a result row in SQLite, so $queryRawUnsafe
    // is required here instead of $executeRawUnsafe (which rejects any result).
    await this.$queryRawUnsafe('PRAGMA journal_mode=WAL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
