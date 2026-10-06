import { IsNotEmpty, IsString } from 'class-validator';
import { IsAccountIdentifier } from '../../../common/validators/account-identifier.validator';

export class LoginDto {
  @IsNotEmpty()
  @IsAccountIdentifier()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
