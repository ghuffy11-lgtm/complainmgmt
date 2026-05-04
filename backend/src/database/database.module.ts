import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { TransactionService } from './transaction.service';
import { BootstrapService } from './bootstrap.service';
import { UserEntity } from '../modules/auth/entities/user.entity';
import { RoleEntity } from '../modules/permissions/entities/role.entity';
import { UserRoleEntity } from '../modules/permissions/entities/user-role.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const app = cfg.get<AppConfig>('app')!;
        return {
          type: 'postgres',
          url: app.databaseUrl,
          autoLoadEntities: true,
          synchronize: false,         // schema is owned by db/migrations/*.sql
          logging: app.nodeEnv === 'development' ? ['error', 'warn', 'migration'] : ['error'],
        };
      },
    }),
    TypeOrmModule.forFeature([UserEntity, RoleEntity, UserRoleEntity]),
  ],
  providers: [TransactionService, BootstrapService],
  exports: [TypeOrmModule, TransactionService],
})
export class DatabaseModule {}
