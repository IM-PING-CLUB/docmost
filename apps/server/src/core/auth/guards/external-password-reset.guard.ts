import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ExternalPasswordResetGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.configService.get<string>(
      'EXTERNAL_PASSWORD_RESET_SECRET',
    );
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const header = request.headers.authorization;
    const match = typeof header === 'string' && /^Bearer (\S+)$/i.exec(header);

    if (typeof secret !== 'string' || secret.length < 32 || !match) {
      throw new UnauthorizedException(
        'Invalid external password reset credentials',
      );
    }

    const digest = (value: string) =>
      createHash('sha256').update(value).digest();
    if (!timingSafeEqual(digest(secret), digest(match[1]))) {
      throw new UnauthorizedException(
        'Invalid external password reset credentials',
      );
    }
    return true;
  }
}
