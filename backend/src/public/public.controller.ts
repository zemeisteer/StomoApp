import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicService } from './public.service';
import { Public } from '../auth/public.decorator';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('clinic')
  @Public()
  async getClinicInfo() {
    return this.publicService.getClinicInfo();
  }

  @Get('branches')
  @Public()
  async getBranches() {
    return this.publicService.getBranches();
  }

  @Get('specialties')
  @Public()
  async getSpecialties() {
    return this.publicService.getSpecialties();
  }

  @Get('doctors')
  @Public()
  async getDoctors(
    @Query('specialty') specialty?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.publicService.getDoctors(specialty, branchId);
  }

  @Get('doctors/:slug')
  @Public()
  async getDoctorBySlug(@Param('slug') slug: string) {
    return this.publicService.getDoctorBySlug(slug);
  }

  @Get('services')
  @Public()
  async getServices(@Query('category') category?: string) {
    return this.publicService.getServices(category);
  }

  @Get('services/:slug')
  @Public()
  async getServiceBySlug(@Param('slug') slug: string) {
    return this.publicService.getServiceBySlug(slug);
  }
}
