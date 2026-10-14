import { Module } from '@nestjs/common';
import { AdminCategoriesController } from './categories.controller';
import { ImportService } from './import.service';
import { AdminOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { AdminProductsController } from './products.controller';
import { AdminPromotionsController } from './promotions.controller';
import { AdminReviewsController } from './reviews.controller';
import { AdminStatsController } from './stats.controller';
import { AdminUsersController } from './users.controller';

@Module({
  controllers: [AdminProductsController, AdminCategoriesController, AdminOrdersController, AdminPromotionsController, AdminReviewsController, AdminUsersController, AdminStatsController],
  providers: [OrdersService, ImportService],
})
export class AdminModule {}
