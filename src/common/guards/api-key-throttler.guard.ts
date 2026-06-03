import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const apiKey = (req.headers as Record<string, string | undefined>)['x-api-key'];
    return apiKey ?? String(req.ip);
  }
}
