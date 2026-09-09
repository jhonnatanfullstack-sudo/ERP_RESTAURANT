import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega los permisos del módulo Caja (FASE 15) y se los asigna al rol
 * Administrador. Nombres tal como los da el ejemplo de la sección 10 de
 * CLAUDE.md: caja.ver / caja.abrir / caja.cerrar. Registrar un movimiento
 * (ingreso/egreso manual) reutiliza `caja.abrir` como el permiso de "operar
 * una caja ya abierta" — CLAUDE.md no predefine un cuarto permiso para eso,
 * ver decisiones-tecnicas.md.
 */
export class SeedPermisosCaja1788962200000 implements MigrationInterface {
  name = 'SeedPermisosCaja1788962200000';

  private readonly permisos = [
    ['caja.ver', 'Ver cajas y sus movimientos'],
    ['caja.abrir', 'Abrir una sesión de caja y registrar sus movimientos'],
    ['caja.cerrar', 'Cerrar una sesión de caja con el arqueo'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, descripcion] of this.permisos) {
      await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
        codigo,
        descripcion,
      ]);
    }

    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT r."id", p."id"
       FROM "roles" r, "permisos" p
       WHERE r."nombre" = 'Administrador' AND p."codigo" = ANY($1::text[])`,
      [this.permisos.map(([codigo]) => codigo)],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "permiso_id" IN (SELECT "id" FROM "permisos" WHERE "codigo" = ANY($1::text[]))`,
      [this.permisos.map(([codigo]) => codigo)],
    );
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = ANY($1::text[])`, [
      this.permisos.map(([codigo]) => codigo),
    ]);
  }
}
