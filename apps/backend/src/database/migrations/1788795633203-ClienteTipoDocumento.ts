import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClienteTipoDocumento1788795633203 implements MigrationInterface {
  name = 'ClienteTipoDocumento1788795633203';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_bcc2e579b8dd6243989d6f2040"`);
    await queryRunner.query(`ALTER TABLE "clientes" ADD "tipo_documento_identidad_id" uuid`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_393e5d5ea9b4fefa4f06f37c06" ON "clientes"  ("tipo_documento_identidad_id", "numero_documento") `,
    );
    await queryRunner.query(
      `ALTER TABLE "clientes" ADD CONSTRAINT "FK_162ea4634e8af35918520514623" FOREIGN KEY ("tipo_documento_identidad_id") REFERENCES "tipos_documento_identidad"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clientes" DROP CONSTRAINT "FK_162ea4634e8af35918520514623"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_393e5d5ea9b4fefa4f06f37c06"`);
    await queryRunner.query(`ALTER TABLE "clientes" DROP COLUMN "tipo_documento_identidad_id"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bcc2e579b8dd6243989d6f2040" ON "clientes" USING btree ("numero_documento") `,
    );
  }
}
