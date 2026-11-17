import { Controller, Get, Inject, Req, UnauthorizedException } from '@nestjs/common';
import { RequirePermission } from './security-metadata.js';
import { SECURITY_CONFIG } from './access-token-verifier.js';
import type { SecurityConfig } from './security-config.js';
import type { AuthSessionResponse, SecuredRequest } from './security.types.js';

@Controller('auth')
export class AuthSessionController {
  constructor(@Inject(SECURITY_CONFIG) private readonly config: SecurityConfig) {}

  @Get('session')
  @RequirePermission('session:read')
  session(@Req() request: SecuredRequest): AuthSessionResponse {
    if (this.config.mode === 'disabled') {
      return { mode: 'local-development', authenticated: false, roles: [], permissions: [] };
    }
    if (request.security?.mode !== 'oidc') {
      throw new UnauthorizedException({ statusCode: 401, code: 'AUTHENTICATION_REQUIRED', message: 'A valid Bearer access token is required.' });
    }
    const { roles, permissions } = request.security.principal;
    return { mode: 'oidc', authenticated: true, roles, permissions };
  }
}
