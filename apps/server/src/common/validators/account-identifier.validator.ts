import { Transform } from 'class-transformer';
import { registerDecorator, ValidationOptions } from 'class-validator';
import {
  isAccountIdentifier,
  normalizeAccountIdentifier,
} from '../helpers/account-identifier';

export function IsAccountIdentifier(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    Transform(({ value }) =>
      Array.isArray(value)
        ? value.map(normalizeAccountIdentifier)
        : normalizeAccountIdentifier(value),
    )(object, propertyName);
    registerDecorator({
      name: 'isAccountIdentifier',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'Account identifier must be 1-254 characters without whitespace or control characters',
        ...options,
      },
      validator: { validate: isAccountIdentifier },
    });
  };
}
