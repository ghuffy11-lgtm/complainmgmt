import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BrandingService } from './branding.service';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';

/** Text-only branding patch; logo upload is a separate multipart endpoint. */
class UpdateBrandingDto {
  @IsOptional() @IsString() @MaxLength(120) organizationName?: string;
  @IsOptional() @IsString() @MaxLength(120) systemName?: string;
  @IsOptional() @IsString() @MaxLength(40)  systemShortName?: string;
  @IsOptional() @IsString() @MaxLength(160) loginSubtitle?: string;
  @IsOptional() @IsString() @MaxLength(240) loginTagline?: string;
  @IsOptional() @IsString() @MaxLength(240) footerText?: string;

  /** #RRGGBB or #RGB. Validated; the frontend derives the rest of the
   *  palette from this single value via HSL math. */
  @IsOptional()
  @IsString()
  @Matches(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, {
    message: 'primaryColor must be a hex color like #2563eb',
  })
  primaryColor?: string;
}

@Controller('branding')
export class PublicBrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Public — login page reads this BEFORE sign-in so the page can render
   *  the right name + logo. */
  @Get()
  @Public()
  get() {
    return this.branding.getPublic();
  }

  /** Public stream of the logo bytes. The URL carries a ?v=… cache buster
   *  so browsers always pick up the latest after an admin uploads a
   *  replacement. */
  @Get('logo')
  @Public()
  async logo(@Res() res: Response): Promise<void> {
    const logo = await this.branding.getLogo();
    if (!logo) throw new NotFoundException({ code: 'LOGO_NOT_SET' });
    res.set('Content-Type', logo.mime);
    res.set('Cache-Control', 'public, max-age=300');
    res.set('Last-Modified', logo.updatedAt.toUTCString());
    res.send(logo.bytes);
  }
}

@Controller('admin/branding')
export class AdminBrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Post()
  @RequirePermissions('admin.settings:manage')
  @HttpCode(204)
  async update(@Body() dto: UpdateBrandingDto, @CurrentUser() actor: AuthUser): Promise<void> {
    await this.branding.updateText(dto, String(actor.id));
  }

  @Post('logo')
  @RequirePermissions('admin.settings:manage')
  @HttpCode(204)
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.branding.setLogo(file, String(actor.id));
  }

  @Delete('logo')
  @RequirePermissions('admin.settings:manage')
  @HttpCode(204)
  async deleteLogo(): Promise<void> {
    await this.branding.deleteLogo();
  }
}
