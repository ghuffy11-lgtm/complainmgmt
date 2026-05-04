import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser } from '../../modules/auth/auth-user.type';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});
