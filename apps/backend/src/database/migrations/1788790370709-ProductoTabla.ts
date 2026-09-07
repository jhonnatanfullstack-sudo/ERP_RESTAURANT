import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductoTabla1788790370709 implements MigrationInterface {
  name = 'ProductoTabla1788790370709';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "productos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nombre" character varying(150) NOT NULL, "descripcion" character varying(500), "precio" numeric(10,2) NOT NULL, "imagen_url" character varying(500), "activo" boolean NOT NULL DEFAULT true, "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "actualizado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "categoria_id" uuid NOT NULL, CONSTRAINT "PK_04f604609a0949a7f3b43400766" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "productos" ADD CONSTRAINT "FK_5aaee6054b643e7c778477193a3" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "productos" DROP CONSTRAINT "FK_5aaee6054b643e7c778477193a3"`,
    );
    await queryRunner.query(`DROP TABLE "productos"`);
  }
}
