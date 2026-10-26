import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { ReviewStatus, StaffRole } from '@prisma/client';
import {
  IsString,
  Min,
  Max,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsInt,
  Length,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateReviewInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Muallif ismi matn bo\'lishi kerak' })
  @Length(2, 60, { message: 'Muallif ismi 2 dan 60 belgigacha bo\'lishi kerak' })
  authorName!: string;

  @IsInt({ message: 'Baho 1 dan 5 gacha butun son bo\'lishi kerak' })
  @Min(1, { message: 'Baho kamida 1 bo\'lishi kerak' })
  @Max(5, { message: 'Baho ko\'pi bilan 5 bo\'lishi kerak' })
  rating!: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Fikr matni matn bo\'lishi kerak' })
  @Length(5, 2000, { message: 'Fikr matni 5 dan 2000 belgigacha bo\'lishi kerak' })
  text!: string;

  @IsBoolean({ message: 'Ismni ko\'rsatish roziligi ko\'rsatilishi kerak' })
  consentDisplayName!: boolean;
}

export class ModerateReviewDto {
  @IsEnum(ReviewStatus, { message: 'Noto\'g\'ri taqriz holati' })
  status!: ReviewStatus;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(0, 500, { message: 'Moderator izohi ko\'pi bilan 500 belgi bo\'lishi mumkin' })
  adminNote?: string;
}

export class PublicReviewsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page butun son bo\'lishi kerak' })
  @Min(1, { message: 'page kamida 1 bo\'lishi kerak' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit butun son bo\'lishi kerak' })
  @Min(1, { message: 'limit kamida 1 bo\'lishi kerak' })
  @Max(100, { message: 'limit ko\'pi bilan 100 bo\'lishi kerak' })
  limit: number = 20;
}

export class ListReviewsQueryDto {
  @IsOptional()
  @IsEnum(ReviewStatus, { message: 'Noto\'g\'ri taqriz holati' })
  status?: ReviewStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page butun son bo\'lishi kerak' })
  @Min(1, { message: 'page kamida 1 bo\'lishi kerak' })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit butun son bo\'lishi kerak' })
  @Min(1, { message: 'limit kamida 1 bo\'lishi kerak' })
  @Max(100, { message: 'limit ko\'pi bilan 100 bo\'lishi kerak' })
  limit: number = 50;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('reviews')
  @Public()
  async getPublicReviews(@Query() query: PublicReviewsQueryDto) {
    return this.reviewsService.findApproved({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Post('reviews')
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  async createReview(@Body() dto: CreateReviewInputDto) {
    await this.reviewsService.create(dto);
    return {
      message: 'Fikringiz uchun rahmat! Moderator tekshiruvidan so\'ng saytda e\'lon qilinadi.',
    };
  }

  @Get('admin/reviews')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async getAdminReviews(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.findAllAdmin({
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 50,
    });
  }

  @Patch('admin/reviews/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async moderateReview(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
    @Req() req: any,
  ) {
    return this.reviewsService.updateStatus(id, dto.status, dto.adminNote, req?.user);
  }

  @Delete('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteReview(@Param('id') id: string, @Req() req: any) {
    await this.reviewsService.delete(id, req?.user);
    return { message: 'Fikr o\'chirildi' };
  }
}
