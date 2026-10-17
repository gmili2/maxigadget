-- CreateTable
CREATE TABLE `product_quantity_discounts` (
    `id` CHAR(36) NOT NULL,
    `productId` CHAR(36) NOT NULL,
    `minQty` INTEGER NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `product_quantity_discounts_productId_minQty_key`(`productId`, `minQty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_quantity_discounts` ADD CONSTRAINT `product_quantity_discounts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
