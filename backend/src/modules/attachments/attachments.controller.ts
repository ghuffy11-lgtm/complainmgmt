import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('complaints/:complaintId/attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @RequirePermissions('complaint:read')
  list(@Param('complaintId') complaintId: string) {
    return this.attachments.list(complaintId);
  }

  @Post()
  @RequirePermissions('complaint:update')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('complaintId') complaintId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.attachments.upload(complaintId, file, actor);
  }

  @Get(':attId/download')
  @RequirePermissions('complaint:read')
  async download(
    @Param('complaintId') complaintId: string,
    @Param('attId') attId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, meta } = await this.attachments.download(complaintId, attId);
    res.setHeader('Content-Type', meta.mimeType);
    res.setHeader('Content-Length', String(meta.byteSize));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${rfc5987(meta.filename)}"; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('ETag', `"${meta.sha256}"`);
    stream.pipe(res);
  }

  @Delete(':attId')
  @RequirePermissions('complaint:read')
  @HttpCode(204)
  async remove(
    @Param('complaintId') complaintId: string,
    @Param('attId') attId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.attachments.remove(complaintId, attId, actor);
  }
}

/**
 * Encode a filename for the ASCII Content-Disposition `filename=` parameter.
 * Non-ASCII chars are stripped here; the `filename*` parameter (RFC 5987,
 * percent-encoded UTF-8) carries the full name for clients that support it.
 */
function rfc5987(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f"\\]/g, '').replace(/[^\x20-\x7e]/g, '_');
}
