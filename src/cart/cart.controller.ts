import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartDto } from './dto/cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Controller('me/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser('userId') userId: number): Promise<CartDto> {
    return this.cartService.getCart(userId);
  }

  @Post('items')
  addItem(
    @CurrentUser('userId') userId: number,
    @Body() dto: AddCartItemDto,
  ): Promise<CartDto> {
    return this.cartService.addItem(userId, dto);
  }

  @Patch('items/:itemId')
  updateItem(
    @CurrentUser('userId') userId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartDto> {
    return this.cartService.updateItem(userId, itemId, dto);
  }

  @Delete('items/:itemId')
  removeItem(
    @CurrentUser('userId') userId: number,
    @Param('itemId', ParseIntPipe) itemId: number,
  ): Promise<CartDto> {
    return this.cartService.removeItem(userId, itemId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  clearCart(@CurrentUser('userId') userId: number): Promise<void> {
    return this.cartService.clearCart(userId);
  }
}
