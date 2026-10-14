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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { StaffRole } from '@prisma/client';

@Controller('admin/media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('category') category?: string,
    @Body('altTextUz') altTextUz?: string,
    @Body('altTextRu') altTextRu?: string,
  ) {
    return this.mediaService.saveFile(file, category, altTextUz, altTextRu);
  }

  @Get()
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

  @Delete(':id')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async delete(@Param('id') id: string) {
    await this.mediaService.delete(id);
    return { message: 'Fayl o\'chirildi' };
  }
}
