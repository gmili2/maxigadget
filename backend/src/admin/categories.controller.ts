import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AuditService } from '../common/audit.service';
import { CurrentUser, Roles, type AuthUser } from '../common/decorators';
import { AppError } from '../common/http';
import { MAX_UPLOAD_BYTES, UploadsService } from '../common/uploads.service';
import { PrismaService } from '../prisma.service';
import { slugify } from './products.controller';

class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
}
class UpdateCategoryDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) position?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const select = {
  id: true, name: true, slug: true, description: true, imageUrl: true, position: true, isActive: true,
  _count: { select: { products: true } },
} as const;

@Roles('ADMIN')
@Controller('admin/categories')
export class AdminCategoriesController {
  constructor(private prisma: PrismaService, private audit: AuditService, private uploads: UploadsService) {}

  @Get()
  async list() {
    return { data: await this.prisma.category.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select }) };
  }

  @Post()
  async create(@Body() dto: CategoryDto, @CurrentUser() me: AuthUser) {
    const last = await this.prisma.category.aggregate({ _max: { position: true } });
    const data = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: { ...dto, slug: slugify(dto.name), position: (last._max.position ?? -1) + 1 }, select });
      await this.audit.log(me.id, 'category.create', 'category', c.id, dto, tx);
      return c;
    });
    return { data };
  }

  /** Le slug n'est pas modifié avec le nom : les liens existants restent valides. */
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto, @CurrentUser() me: AuthUser) {
    const data = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.update({ where: { id }, data: dto, select });
      await this.audit.log(me.id, 'category.update', 'category', id, dto, tx);
      return c;
    });
    return { data };
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    const c = await this.prisma.category.findUniqueOrThrow({ where: { id }, select });
    if (c._count.products) throw new AppError(HttpStatus.CONFLICT, 'CATEGORY_IN_USE', `${c._count.products} produit(s) dans cette catégorie : déplacez-les d’abord`);
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.log(me.id, 'category.delete', 'category', id, { name: c.name }, tx);
    });
    await this.uploads.removeByUrl(c.imageUrl);
  }

  @Post(':id/image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  async image(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @CurrentUser() me: AuthUser) {
    const before = await this.prisma.category.findUniqueOrThrow({ where: { id }, select });
    const saved = await this.uploads.saveImage(file, 'categories');
    try {
      const data = await this.prisma.$transaction(async (tx) => {
        const c = await tx.category.update({ where: { id }, data: { imageUrl: saved.url }, select });
        await this.audit.log(me.id, 'category.image', 'category', id, { url: saved.url }, tx);
        return c;
      });
      await this.uploads.removeByUrl(before.imageUrl);
      return { data };
    } catch (e) {
      await this.uploads.removeByUrl(saved.url);
      throw e;
    }
  }

  @Delete(':id/image')
  async removeImage(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() me: AuthUser) {
    const before = await this.prisma.category.findUniqueOrThrow({ where: { id }, select });
    const data = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.update({ where: { id }, data: { imageUrl: null }, select });
      await this.audit.log(me.id, 'category.image_remove', 'category', id, undefined, tx);
      return c;
    });
    await this.uploads.removeByUrl(before.imageUrl);
    return { data };
  }
}
