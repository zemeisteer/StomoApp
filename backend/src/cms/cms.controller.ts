import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CmsService, CreateArticleDto, CreateFaqDto } from './cms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ContentStatus, StaffRole } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsBoolean,
  Length,
} from 'class-validator';

export class ArticleInputDto {
  @IsString()
  @Length(2, 200)
  slug!: string;

  @IsString()
  @Length(2, 255)
  titleUz!: string;

  @IsString()
  @Length(2, 255)
  titleRu!: string;

  @IsString()
  contentUz!: string;

  @IsString()
  contentRu!: string;

  @IsOptional()
  @IsString()
  excerptUz?: string;

  @IsOptional()
  @IsString()
  excerptRu?: string;

  @IsString()
  authorName!: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @IsString()
  metaTitleUz?: string;

  @IsOptional()
  @IsString()
  metaTitleRu?: string;

  @IsOptional()
  @IsString()
  metaDescriptionUz?: string;

  @IsOptional()
  @IsString()
  metaDescriptionRu?: string;
}

export class FaqInputDto {
  @IsString()
  questionUz!: string;

  @IsString()
  questionRu!: string;

  @IsString()
  answerUz!: string;

  @IsString()
  answerRu!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller()
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  // ============================================================
  // PUBLIC ENDPOINTS
  // ============================================================

  @Get(['articles', 'cms/articles'])
  @Public()
  async getPublicArticles(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.cmsService.findPublishedArticles({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });
  }

  @Get(['articles/:slug', 'cms/articles/:slug', 'public/articles/:slug'])
  @Public()
  async getPublicArticleBySlug(@Param('slug') slug: string) {
    return this.cmsService.findPublishedArticleBySlug(slug);
  }

  @Get(['faqs', 'cms/faqs'])
  @Public()
  async getPublicFaqs() {
    return this.cmsService.findActiveFaqs();
  }

  @Get(['homepage-sections', 'cms/sections', 'cms/homepage-sections'])
  @Public()
  async getPublicHomepageSections() {
    return this.cmsService.findActiveHomepageSections();
  }

  @Get(['policies', 'cms/policies'])
  @Public()
  async getPolicies() {
    return this.cmsService.getPolicies();
  }

  // ============================================================
  // ADMIN ENDPOINTS (OWNER, ADMIN, EDITOR)
  // ============================================================

  @Get('admin/articles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async getAdminArticles(
    @Query('status') status?: ContentStatus,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.cmsService.findAllArticlesAdmin({
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
  }

  @Get('admin/articles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async getAdminArticleById(@Param('id') id: string) {
    return this.cmsService.findArticleById(id);
  }

  @Post('admin/articles')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async createArticle(@Body() dto: ArticleInputDto) {
    return this.cmsService.createArticle(dto);
  }

  @Put('admin/articles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async updateArticle(@Param('id') id: string, @Body() dto: Partial<ArticleInputDto>) {
    return this.cmsService.updateArticle(id, dto);
  }

  @Delete('admin/articles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteArticle(@Param('id') id: string) {
    await this.cmsService.deleteArticle(id);
    return { message: 'Maqola o\'chirildi' };
  }

  @Get('admin/faqs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async getAdminFaqs() {
    return this.cmsService.findAllFaqsAdmin();
  }

  @Post('admin/faqs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async createFaq(@Body() dto: FaqInputDto) {
    return this.cmsService.createFaq(dto);
  }

  @Put('admin/faqs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async updateFaq(@Param('id') id: string, @Body() dto: Partial<FaqInputDto>) {
    return this.cmsService.updateFaq(id, dto);
  }

  @Delete('admin/faqs/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteFaq(@Param('id') id: string) {
    await this.cmsService.deleteFaq(id);
    return { message: 'FAQ o\'chirildi' };
  }

  @Put('admin/homepage-sections/:key')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async updateHomepageSection(
    @Param('key') key: string,
    @Body() body: any,
  ) {
    return this.cmsService.upsertHomepageSection(key, body);
  }

  @Put('admin/policies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async updatePolicies(@Body() body: { privacyPolicy?: any; bookingPolicy?: any }) {
    return this.cmsService.updatePolicies(body);
  }
}
