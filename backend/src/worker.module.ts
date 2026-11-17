import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { mikroOrmOptions } from './infrastructure/persistence/mikro-orm.options.js';
import { ApplicationServicesModule } from './infrastructure/wiring/application-services.module.js';
import { MessagingModule } from './infrastructure/messaging/messaging.module.js';
import { SecurityModule } from './presentation/http/security/security.module.js';

@Module({
  imports: [SecurityModule, MikroOrmModule.forRoot(mikroOrmOptions), ApplicationServicesModule, MessagingModule],
})
export class WorkerModule {}
