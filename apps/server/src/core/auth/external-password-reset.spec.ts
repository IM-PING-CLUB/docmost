import {
  Body,
  Controller,
  Post,
  HttpException,
  Logger,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ExternalPasswordResetController } from './external-password-reset.controller';
import { ExternalPasswordResetGuard } from './guards/external-password-reset.guard';
import { ExternalPasswordResetService } from './services/external-password-reset.service';
import { ConfigService } from '@nestjs/config';
import { ExternalPasswordResetDto } from './dto/external-password-reset.dto';
import { TransformHttpResponseInterceptor } from '../../common/interceptors/http-response.interceptor';

// Exercise HTTP wiring, validation and real authentication without database dependencies.
jest.mock('./services/external-password-reset.service', () => ({
  ExternalPasswordResetService: class ExternalPasswordResetService {},
}));

@Controller('unrelated')
class UnrelatedController {
  @Post('validate')
  validate(@Body() dto: ExternalPasswordResetDto) {
    return dto.email;
  }
  @Post('missing')
  missing() {
    throw new NotFoundException('Unchanged error');
  }
}

const secret = 'a'.repeat(64);

describe('External password reset HTTP endpoint', () => {
  let app: NestFastifyApplication;
  let configuredSecret: string | undefined;
  const service = { resetPassword: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ExternalPasswordResetController, UnrelatedController],
      providers: [
        ExternalPasswordResetGuard,
        { provide: ExternalPasswordResetService, useValue: service },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'EXTERNAL_PASSWORD_RESET_SECRET'
                ? configuredSecret
                : undefined,
          },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalInterceptors(
      new TransformHttpResponseInterceptor(app.get(Reflector)),
    );
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (req) => {
        (req.raw as any).workspace = { id: 'workspace-1' };
      });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => {
    configuredSecret = secret;
    service.resetPassword.mockReset();
  });
  afterAll(async () => {
    await app.close();
  });

  const request = (
    authorization?: string,
    payload: any = { email: 'user@example.com', password: 'new-password' },
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/external-password-reset',
      headers: authorization ? { authorization } : {},
      payload,
    });

  it.each([
    undefined,
    '',
    'Basic abc',
    'Bearer wrong',
    `Bearer ${secret} extra`,
  ])('rejects credentials %s before accessing users', async (header) => {
    expect((await request(header)).statusCode).toBe(401);
    expect(service.resetPassword).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'short'])(
    'fails closed for missing or weak configuration %s',
    async (value) => {
      configuredSecret = value;
      expect((await request(`Bearer ${secret}`)).statusCode).toBe(401);
      expect(service.resetPassword).not.toHaveBeenCalled();
    },
  );
  it.each([
    { email: 'invalid', password: 'new-password' },
    { email: 'user@example.com', password: 'short' },
    { email: 'user@example.com', password: 12345678 },
    { email: 'user@example.com' },
    { email: 'user@example.com', password: 'a'.repeat(73) },
  ])('validates the request body %j', async (payload) => {
    expect((await request(`Bearer ${secret}`, payload)).statusCode).toBe(400);
    expect(service.resetPassword).not.toHaveBeenCalled();
  });
  it('uses the resolved workspace and returns the unified response without a login cookie', async () => {
    const response = await request(`Bearer ${secret}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      success: true,
      statusCode: 200,
      message: 'Password reset successfully',
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(service.resetPassword).toHaveBeenCalledWith(
      { email: 'user@example.com', password: 'new-password' },
      { id: 'workspace-1' },
    );
  });
  it('returns 404 for an unavailable user', async () => {
    service.resetPassword.mockRejectedValueOnce(
      new NotFoundException('User not found'),
    );
    const response = await request(`Bearer ${secret}`);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      statusCode: 404,
      success: false,
      message: 'User not found',
    });
  });
  it('normalizes validation and authentication errors with string messages', async () => {
    for (const response of [
      await request(),
      await request(`Bearer ${secret}`, { email: 'bad', password: 'short' }),
    ]) {
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual([
        'message',
        'statusCode',
        'success',
      ]);
      expect(typeof body.message).toBe('string');
      expect(body.success).toBe(false);
      expect(body.statusCode).toBe(response.statusCode);
    }
  });
  it('normalizes rate limiting responses', async () => {
    service.resetPassword.mockRejectedValueOnce(
      new HttpException('Too many requests', 429),
    );
    const response = await request(`Bearer ${secret}`);
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      statusCode: 429,
      success: false,
      message: 'Too many requests',
    });
  });
  it('hides internal error contents behind the same response shape', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      service.resetPassword.mockRejectedValueOnce(
        new Error('secret database credentials'),
      );
      const response = await request(`Bearer ${secret}`);
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        statusCode: 500,
        success: false,
        message: 'Internal Server Error',
      });
    } finally {
      log.mockRestore();
    }
  });
  it('keeps all validation messages in the string', async () => {
    const response = await request(`Bearer ${secret}`, {
      email: 'bad',
      password: 'short',
    });
    expect(response.json().message).toBe(
      'email must be an email; password must be longer than or equal to 8 characters',
    );
  });
  it('leaves other controllers authentication and error formats unchanged', async () => {
    configuredSecret = '';
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/unrelated/validate',
      payload: { email: 'bad', password: 'new-password' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: ['email must be an email'],
    });
    const missing = await app.inject({
      method: 'POST',
      url: '/api/unrelated/missing',
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Unchanged error',
    });
  });
  it('preserves the global success envelope on unrelated routes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/unrelated/validate',
      payload: { email: 'user@example.com', password: 'new-password' },
    });
    expect(response.json()).toEqual({
      data: 'user@example.com',
      success: true,
      status: 201,
    });
  });
});
