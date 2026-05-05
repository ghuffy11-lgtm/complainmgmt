import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from 'nestjs-pino';
import { envSchema, loadConfig } from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './common/health.controller';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DynamicFieldsModule } from './modules/dynamic-fields/dynamic-fields.module';
import { ComplaintsModule } from './modules/complaints/complaints.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
import { AttachmentsModule } from './modules/attachments/attachments.module';
import { AuditModule } from './modules/audit/audit.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DisplayNamesModule } from './modules/display-names/display-names.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ app: loadConfig() })],
      validationSchema: envSchema,
      validationOptions: { abortEarly: true },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    DepartmentsModule,
    DynamicFieldsModule,
    ComplaintsModule,
    AssignmentsModule,
    AttachmentsModule,
    AuditModule,
    DashboardModule,
    AdminModule,
    NotificationsModule,
    DisplayNamesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
