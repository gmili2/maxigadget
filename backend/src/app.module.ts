import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CatalogController } from './catalog/catalog.controller';
import { PricingService } from './catalog/pricing.service';
import { AuditModule } from './common/audit.service';
import { UploadsModule } from './common/uploads.service';
import { CheckoutController } from './shop/checkout.controller';
import { SiteAccess, SiteAccessGuard } from './shop/site-access';
import { SiteController } from './shop/site.controller';
import { CheckoutService } from './shop/checkout.service';
import { OrderMail } from './shop/order-mail';
import { MailService } from './common/mail.service';
import { Public } from './common/decorators';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { validateEnv } from './config';
import { PrismaModule, PrismaService } from './prisma.service';

@Public()
@Controller('health')
class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { data: { status: 'ok', db: 'ok', time: new Date().toISOString() } };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    AuditModule,
    UploadsModule,
    AdminModule,
  ],
  controllers: [HealthController, AuthController, CatalogController, CheckoutController, SiteController],
  providers: [
    AuthService,
    PricingService,
    CheckoutService,
    MailService,
    OrderMail,
    SiteAccess,
    SiteAccessGuard,
    // Ordre : limitation de débit, puis authentification, puis rôle.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
