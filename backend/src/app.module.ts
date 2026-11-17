import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { DomainHttpExceptionFilter } from './presentation/http/filters/domain-http-exception.filter.js';
import { FinancialApiModule } from './presentation/http/financial/financial-api.module.js';
import { mikroOrmOptions } from './infrastructure/persistence/mikro-orm.options.js';
import { HealthModule } from './presentation/http/health/health.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { SecurityModule } from './presentation/http/security/security.module.js';

@Module({
  imports: [
    SecurityModule,
    MikroOrmModule.forRoot(mikroOrmOptions),
    HealthModule,
    FinancialApiModule,
    MessagingModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainHttpExceptionFilter }],
})
export class AppModule {}
