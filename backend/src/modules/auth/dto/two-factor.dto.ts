import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Body for POST /auth/2fa/enable — the provisional secret echoed back
 *  from /auth/2fa/setup, plus the first 6-digit code from the user's
 *  authenticator app. */
export class EnableTwoFactorDto {
  @IsString()
  @MinLength(16)
  @MaxLength(64)
  provisionalSecret!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}

/** Body for POST /auth/2fa/verify — challenge token from the password
 *  step, plus either a 6-digit TOTP or a backup code. */
export class VerifyTwoFactorDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  challengeToken!: string;

  /**
   * Either a 6-digit TOTP code OR a backup code (5-5 grouped or
   * unformatted, with or without dashes/spaces). Validation is
   * deliberately loose at the DTO layer — the service tries TOTP
   * first, then backup-code, and returns a single 401 either way to
   * avoid leaking which path failed.
   */
  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

/** Body for POST /auth/2fa/disable — current password, re-asserting
 *  the user is still in possession of the account. */
export class DisableTwoFactorDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  currentPassword!: string;
}
