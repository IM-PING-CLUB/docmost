import * as fs from 'node:fs';
import { StaticModule } from './static.module';

describe('StaticModule', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should inject OEM runtime config into window.CONFIG', async () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined);
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValue('<html><body><!--window-config--></body></html>');
    const writeFileSyncSpy = jest
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => undefined);
    jest.spyOn(fs, 'createReadStream').mockReturnValue({} as never);

    const app = {
      register: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
    };

    const httpAdapterHost = {
      httpAdapter: {
        getInstance: () => app,
      },
    } as any;

    const environmentService = {
      getNodeEnv: jest.fn().mockReturnValue('production'),
      getAppUrl: jest.fn().mockReturnValue('https://docmost-uat.imdev.work'),
      isCloud: jest.fn().mockReturnValue(false),
      getFileUploadSizeLimit: jest.fn().mockReturnValue('50mb'),
      getFileImportSizeLimit: jest.fn().mockReturnValue('200mb'),
      getDrawioUrl: jest.fn().mockReturnValue('https://embed.diagrams.net'),
      getCollabUrl: jest.fn().mockReturnValue('wss://docmost-uat.imdev.work/collab'),
      getPostHogHost: jest.fn().mockReturnValue(undefined),
      getPostHogKey: jest.fn().mockReturnValue(undefined),
      isOem: jest.fn().mockReturnValue(true),
      isOemHideApiKeys: jest.fn().mockReturnValue(true),
      isOemHideSecuritySso: jest.fn().mockReturnValue(true),
      isOemHideApiManagement: jest.fn().mockReturnValue(true),
      isOemHideAuditLog: jest.fn().mockReturnValue(true),
      isOemHideAiSettings: jest.fn().mockReturnValue(true),
      isOemHideVersionUpdate: jest.fn().mockReturnValue(true),
      isOemHideLicense: jest.fn().mockReturnValue(true),
      isOemHideVerifiedPages: jest.fn().mockReturnValue(true),
      getOemAppName: jest.fn().mockReturnValue('Ping 云文档'),
    } as any;

    const module = new StaticModule(httpAdapterHost, environmentService);

    await module.onModuleInit();

    expect(writeFileSyncSpy).toHaveBeenCalled();
    const transformedHtml = writeFileSyncSpy.mock.calls[0][1] as string;

    expect(transformedHtml).toContain('"OEM":true');
    expect(transformedHtml).toContain('"OEM_HIDE_API_KEYS":true');
    expect(transformedHtml).toContain('"OEM_HIDE_SECURITY_SSO":true');
    expect(transformedHtml).toContain('"OEM_HIDE_API_MANAGEMENT":true');
    expect(transformedHtml).toContain('"OEM_HIDE_AUDIT_LOG":true');
    expect(transformedHtml).toContain('"OEM_HIDE_AI_SETTINGS":true');
    expect(transformedHtml).toContain('"OEM_HIDE_VERSION_UPDATE":true');
    expect(transformedHtml).toContain('"OEM_HIDE_LICENSE":true');
    expect(transformedHtml).toContain('"OEM_HIDE_VERIFIED_PAGES":true');
    expect(transformedHtml).toContain('"OEM_APP_NAME":"Ping 云文档"');
  });
});
