import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../users/role.enum';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { OrderDto } from './dto/order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('me/orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  checkout(
    @CurrentUser('userId') userId: number,
    @Body() dto: CheckoutOrderDto,
  ): Promise<OrderDto> {
    return this.ordersService.checkout(userId, dto);
  }

  @Get()
  listMine(@CurrentUser('userId') userId: number): Promise<OrderDto[]> {
    return this.ordersService.listMine(userId);
  }

  @Get(':orderId')
  getOne(
    @CurrentUser('userId') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ): Promise<OrderDto> {
    return this.ordersService.getOne(userId, orderId);
  }

  @Patch(':orderId')
  cancel(
    @CurrentUser('userId') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderDto> {
    return this.ordersService.cancel(userId, orderId, dto);
  }
}

@Controller('admin/orders')
@UseGuards(RolesGuard)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(Role.Admin)
  listAll(): Promise<OrderDto[]> {
    return this.ordersService.listAll();
  }

  @Get(':orderId')
  @Roles(Role.Admin)
  getOne(@Param('orderId', ParseIntPipe) orderId: number): Promise<OrderDto> {
    return this.ordersService.getOneAdmin(orderId);
  }

  @Patch(':orderId/status')
  @Roles(Role.Admin)
  updateStatus(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderDto> {
    return this.ordersService.updateStatus(orderId, dto);
  }
}
