import { Body, Controller, Get, Headers, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { PaymentMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Public } from '../common/decorators';
import { CheckoutService } from './checkout.service';
import { SiteAccessGuard } from './site-access';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
export const COUNTRIES = ['MA'];
/** Moyens de paiement proposés en boutique (la carte arrivera avec Stripe). */
export const SHOP_PAYMENTS = [PaymentMethod.CASH_ON_DELIVERY, PaymentMethod.BANK_TRANSFER];

class ItemDto {
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) slug: string;
  @IsOptional() @IsUUID() variantId?: string;
  @IsInt() @Min(1) @Max(10) quantity: number;
}
class CustomerDto {
  @trim() @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  // Formulaire court de la boutique : un seul champ « nom », pas d'e-mail.
  @IsOptional() @trim() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value)) @IsEmail() @MaxLength(254) email?: string;
  @trim() @Matches(/^\+?[0-9 ().-]{8,20}$/, { message: 'رقم الهاتف غير صحيح' }) phone: string;
}
class AddressDto {
  @trim() @IsString() @MinLength(3) @MaxLength(160) line1: string;
  @IsOptional() @trim() @IsString() @MaxLength(160) line2?: string;
  @trim() @IsString() @MinLength(2) @MaxLength(100) city: string;
  @IsOptional() @trim() @Matches(/^[0-9]{5}$/, { message: 'Code postal : 5 chiffres' }) postalCode?: string;
  @IsIn(COUNTRIES) country: string;
}
export class QuoteDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => ItemDto) items: ItemDto[];
  /** Facultatif : la livraison est incluse dans le prix, le mode par défaut du pays s'applique. */
  @IsOptional() @IsUUID() shippingMethodId?: string;
  @IsIn(SHOP_PAYMENTS) paymentMethod: PaymentMethod;
  @IsIn(COUNTRIES) country = 'MA';
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() || undefined : value)) @IsString() @MaxLength(40) couponCode?: string;
}
export class CheckoutDto extends QuoteDto {
  @ValidateNested() @Type(() => CustomerDto) customer: CustomerDto;
  @ValidateNested() @Type(() => AddressDto) address: AddressDto;
  @IsOptional() @trim() @IsString() @MaxLength(500) note?: string;
}

@Public()
@UseGuards(SiteAccessGuard)
@Controller()
export class CheckoutController {
  constructor(private checkout: CheckoutService) {}

  @Get('shipping/methods')
  async methods(@Query('country') country = 'MA') {
    return { data: await this.checkout.shippingMethods(COUNTRIES.includes(country) ? country : 'MA') };
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('orders/quote') @HttpCode(200)
  async quote(@Body() dto: QuoteDto) {
    return { data: await this.checkout.quote(dto) };
  }

  /** En-tête Idempotency-Key conseillé : un double clic ne crée pas deux commandes. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders')
  async create(@Body() dto: CheckoutDto, @Req() req: Request, @Headers('idempotency-key') key?: string) {
    const idem = key && /^[\w-]{8,64}$/.test(key) ? key : undefined;
    dto.country = dto.address.country;
    // Pour l'API Conversions de Meta : adresse et navigateur du client, cookies du pixel.
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>;
    const browser = { ip: req.ip, userAgent: req.header('user-agent'), fbp: cookies._fbp, fbc: cookies._fbc, url: req.header('referer') };
    return { data: await this.checkout.create(dto, idem, browser) };
  }
}
