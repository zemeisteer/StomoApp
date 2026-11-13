import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StaffRole } from '@prisma/client';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaymeService } from './payme.service';
import { ClickService } from './click.service';
import { invoiceBalance } from '../billing/invoice-ledger';

/** Provider callbacks. Authentication is the provider's own (Basic key / md5 signature), not staff JWT. */
@Controller('payments')
@SkipThrottle()
export class PaymentProvidersController {
  constructor(
    private readonly payme: PaymeService,
    private readonly click: ClickService,
  ) {}

  @Post('payme')
  @Public()
  @HttpCode(200)
  paymeRpc(@Body() body: any, @Headers('authorization') auth?: string) {
    return this.payme.handle(body, auth);
  }

  @Post('click/prepare')
  @Public()
  @HttpCode(200)
  clickPrepare(@Body() body: any) {
    return this.click.prepare(body);
  }

  @Post('click/complete')
  @Public()
  @HttpCode(200)
  clickComplete(@Body() body: any) {
    return this.click.complete(body);
  }
}

@Controller('admin/billing')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentLinksController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payme: PaymeService,
    private readonly click: ClickService,
  ) {}

  /** Checkout links for the remaining balance of an invoice (only for configured providers). */
  @Get('invoices/:id/payment-links')
  @Roles(StaffRole.OWNER, StaffRole.ADMIN, StaffRole.RECEPTION)
  async links(@Param('id') id: string) {
    const inv = await this.prisma.invoice.findUnique({ where: { id }, select: { id: true, totalAmount: true, discount: true, status: true } });
    if (!inv) throw new NotFoundException('Hisob-faktura topilmadi');
    const { debt } = await invoiceBalance(this.prisma, { id: inv.id, total_amount: inv.totalAmount, discount: inv.discount });
    const payable = debt > 0 && inv.status !== 'CANCELLED';
    return {
      amountUzs: debt,
      payme: payable ? this.payme.checkoutUrl(inv.id, debt) : null,
      click: payable ? this.click.payUrl(inv.id, debt) : null,
    };
  }
}
