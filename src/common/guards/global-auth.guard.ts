import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { hcmConfig } from '../config/hcm.config';
import { ErrorFactory } from '../errors/error-factory';
import { IS_ADMIN_ONLY_KEY, IS_PUBLIC_KEY } from './auth.decorators';

@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(hcmConfig.KEY)
    private readonly config: ConfigType<typeof hcmConfig>,
    private readonly errorFactory: ErrorFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const isAdminOnly = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const provided = request.headers['x-api-key'] ?? '';
    const expected = isAdminOnly ? this.config.adminApiKey : this.config.serviceApiKey;

    if (!this.timingSafeCompare(provided, expected)) {
      throw this.errorFactory.unauthorized('API_KEY_INVALID');
    }

    return true;
  }

  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }
}
