import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from './environment.service';

describe('EnvironmentService', () => {
  let service: EnvironmentService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          OEM: 'true',
          OEM_HIDE_API_KEYS: 'true',
          OEM_HIDE_SECURITY_SSO: 'false',
          OEM_HIDE_API_MANAGEMENT: 'true',
          OEM_HIDE_AUDIT_LOG: 'true',
          OEM_HIDE_AI_SETTINGS: 'false',
          OEM_HIDE_VERSION_UPDATE: 'true',
          OEM_HIDE_LICENSE: 'true',
          OEM_APP_NAME: 'Ping 云文档',
        };

        return values[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnvironmentService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should expose OEM runtime config values', () => {
    expect(service.isOem()).toBe(true);
    expect(service.isOemHideApiKeys()).toBe(true);
    expect(service.isOemHideSecuritySso()).toBe(false);
    expect(service.isOemHideApiManagement()).toBe(true);
    expect(service.isOemHideAuditLog()).toBe(true);
    expect(service.isOemHideAiSettings()).toBe(false);
    expect(service.isOemHideVersionUpdate()).toBe(true);
    expect(service.isOemHideLicense()).toBe(true);
    expect(service.getOemAppName()).toBe('Ping 云文档');
  });
});
