import { BadRequestException } from '@nestjs/common';
import { Workspace } from '@docmost/db/types/entity.types';
import { validateAllowedEmail } from './auth.util';

describe('validateAllowedEmail', () => {
  const workspace = (emailDomains?: string[]) =>
    ({ emailDomains }) as Workspace;

  it.each(['用户', 'a', ' User+Tag! ', 'not@an@email', 'USER@EXAMPLE.COM'])(
    '没有域名限制时允许合法账号 %s',
    (identifier) => {
      expect(() => validateAllowedEmail(identifier, workspace())).not.toThrow();
      expect(() =>
        validateAllowedEmail(identifier, workspace([])),
      ).not.toThrow();
    },
  );

  it.each([
    null,
    undefined,
    123,
    {},
    [],
    '',
    ' ',
    'a b',
    'a\u0000b',
    'a'.repeat(255),
  ])('非法值 %p 返回 400 而非 TypeError', (identifier) => {
    expect(() =>
      validateAllowedEmail(identifier as string, workspace()),
    ).toThrow(BadRequestException);
  });

  it.each([
    '用户',
    'user',
    'user@',
    '@example.com',
    'user@@example.com',
    'user@example.com/path',
  ])('有域名限制时非邮箱 %s 不能绕过策略', (identifier) => {
    expect(() =>
      validateAllowedEmail(identifier, workspace(['example.com'])),
    ).toThrow(BadRequestException);
  });

  it('邮箱与配置域名均大小写不敏感', () => {
    expect(() =>
      validateAllowedEmail(' USER@Example.COM ', workspace(['EXAMPLE.COM'])),
    ).not.toThrow();
  });

  it('拒绝不匹配的邮箱及子域名', () => {
    for (const email of ['user@other.com', 'user@sub.example.com']) {
      expect(() =>
        validateAllowedEmail(email, workspace(['example.com'])),
      ).toThrow(BadRequestException);
    }
  });
});
