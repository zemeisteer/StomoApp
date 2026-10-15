import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';
import * as fs from 'fs';

@Controller(['admin/media', 'media'])
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB limit enforced before buffering
        files: 1,
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category?: string,
    @Body('altTextUz') altTextUz?: string,
    @Body('altTextRu') altTextRu?: string,
  ) {
    return this.mediaService.saveFile(file, category, altTextUz, altTextRu);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async findAll(
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.mediaService.findAll({
      category,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  /**
   * Securely serve locally stored images with strict headers to prevent same-origin script execution.
   * Publicly accessible so public pages can display CMS images.
   */
  @Get('file/:fileName')
  async serveFile(@Param('fileName') fileName: string, @Res() res: Response) {
    const { filePath, mimeType } = await this.mediaService.getLocalFile(fileName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(filePath).pipe(res);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async delete(@Param('id') id: string) {
    await this.mediaService.delete(id);
    return { message: "Fayl o'chirildi" };
  }
}
