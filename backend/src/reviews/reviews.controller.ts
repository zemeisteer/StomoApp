import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsInt,
  Length,
} from 'class-validator';

export class CreateReviewInputDto {
  @IsString()
  @Length(2, 60)
  authorName!: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsString()
  @Length(5, 2000)
  text!: string;

  @IsBoolean()
  consentDisplayName!: boolean;

  @IsOptional()
  @IsString()
  patientId?: string;
}

export class ModerateReviewDto {
  @IsEnum(ReviewStatus)
  status!: ReviewStatus;

  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class ListReviewsQueryDto {
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get('reviews')
  @Public()
  async getPublicReviews(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.reviewsService.findApproved({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
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
    return this.reviewsService.findAllAdmin(query);
  }

  @Patch('admin/reviews/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.EDITOR)
  async moderateReview(
    @Param('id') id: string,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviewsService.updateStatus(id, dto.status, dto.adminNote);
  }

  @Delete('admin/reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(StaffRole.OWNER, StaffRole.ADMIN)
  async deleteReview(@Param('id') id: string) {
    await this.reviewsService.delete(id);
    return { message: 'Fikr o\'chirildi' };
  }
}
