-- AlterTable
ALTER TABLE `orders` ADD COLUMN `discountLabel` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `quantity_discounts` (
    `id` CHAR(36) NOT NULL,
    `minQty` INTEGER NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quantity_discounts_minQty_key`(`minQty`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
