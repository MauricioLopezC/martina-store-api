import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrders1783279679838 implements MigrationInterface {
  name = 'AddOrders1783279679838';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" SERIAL NOT NULL, "orderId" integer NOT NULL, "variantId" integer, "productNameSnapshot" character varying NOT NULL, "skuSnapshot" character varying NOT NULL, "quantity" integer NOT NULL, "price" numeric(10,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending_payment', 'paid', 'cancelled', 'shipped', 'delivered')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "status" "public"."orders_status_enum" NOT NULL DEFAULT 'pending_payment', "totalPrice" numeric(10,2) NOT NULL, "shippingAddressLine" character varying NOT NULL, "shippingCity" character varying NOT NULL, "shippingState" character varying NOT NULL, "shippingZipCode" character varying NOT NULL, "shippingPhone" character varying, "externalReference" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_e57d5cadfa42aac52f84506ebbf" UNIQUE ("externalReference"), CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_516736b9807228bb17b2d0a3e2a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_f1d359a55923bb45b057fbdab0d"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
  }
}
