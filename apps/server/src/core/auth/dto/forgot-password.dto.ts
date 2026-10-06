import { IsNotEmpty } from 'class-validator';
import { IsAccountIdentifier } from '../../../common/validators/account-identifier.validator';

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsAccountIdentifier()
  email: string;
}
