import bcrypt from 'bcrypt';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Datos semilla para poder operar el sistema desde cero:
 * - Catálogo de permisos para los módulos ya implementados (usuarios, personal,
 *   roles, permisos, empresa).
 * - Rol "Administrador" con todos esos permisos.
 * - Una empresa, un registro de personal y un usuario Administrador de arranque,
 *   necesarios porque todos los endpoints de creación exigen autenticación
 *   (no hay forma de crear el primer usuario sin uno ya existente).
 *
 * IMPORTANTE: los datos de la empresa y la contraseña del administrador son
 * PLACEHOLDERS. Deben editarse/cambiarse inmediatamente después del primer
 * inicio de sesión (PUT /api/empresas/:id y POST /api/auth/cambiar-password).
 */
export class SeedRbacInicial1788763124133 implements MigrationInterface {
  name = 'SeedRbacInicial1788763124133';

  private readonly permisos = [
    ['usuarios.ver', 'Ver usuarios'],
    ['usuarios.crear', 'Crear usuarios'],
    ['usuarios.editar', 'Editar usuarios'],
    ['personal.ver', 'Ver personal'],
    ['personal.crear', 'Crear personal'],
    ['personal.editar', 'Editar personal'],
    ['roles.ver', 'Ver roles'],
    ['roles.crear', 'Crear roles'],
    ['roles.editar', 'Editar roles'],
    ['permisos.ver', 'Ver permisos'],
    ['empresa.ver', 'Ver empresa'],
    ['empresa.crear', 'Crear empresa'],
    ['empresa.editar', 'Editar empresa'],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [codigo, descripcion] of this.permisos) {
      await queryRunner.query(`INSERT INTO "permisos" ("codigo", "descripcion") VALUES ($1, $2)`, [
        codigo,
        descripcion,
      ]);
    }

    const [rolAdmin] = await queryRunner.query(
      `INSERT INTO "roles" ("nombre", "descripcion") VALUES ($1, $2) RETURNING id`,
      ['Administrador', 'Rol con acceso completo al sistema'],
    );

    await queryRunner.query(
      `INSERT INTO "roles_permisos" ("rol_id", "permiso_id")
       SELECT $1, "id" FROM "permisos" WHERE "codigo" = ANY($2::text[])`,
      [rolAdmin.id, this.permisos.map(([codigo]) => codigo)],
    );

    const [empresa] = await queryRunner.query(
      `INSERT INTO "empresas" ("ruc", "razon_social", "nombre_comercial")
       VALUES ($1, $2, $3) RETURNING id`,
      ['20000000001', 'Empresa Demo S.A.C. (editar)', 'Restaurante Demo'],
    );

    const [tipoDni] = await queryRunner.query(
      `SELECT "id" FROM "tipos_documento_identidad" WHERE "codigo" = '1'`,
    );

    const [personalAdmin] = await queryRunner.query(
      `INSERT INTO "personal"
         ("empresa_id", "tipo_documento_identidad_id", "numero_documento", "nombres", "apellido_paterno")
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [empresa.id, tipoDni.id, '00000000', 'Administrador', 'Sistema'],
    );

    const passwordHash = await bcrypt.hash('CambiarInmediatamente123!', 12);

    await queryRunner.query(
      `INSERT INTO "usuarios" ("personal_id", "rol_id", "email", "password_hash")
       VALUES ($1, $2, $3, $4)`,
      [personalAdmin.id, rolAdmin.id, 'admin@restaurant.local', passwordHash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "usuarios" WHERE "email" = 'admin@restaurant.local'`);
    await queryRunner.query(
      `DELETE FROM "personal" WHERE "numero_documento" = '00000000' AND "nombres" = 'Administrador'`,
    );
    await queryRunner.query(`DELETE FROM "empresas" WHERE "ruc" = '20000000001'`);
    await queryRunner.query(
      `DELETE FROM "roles_permisos" WHERE "rol_id" = (SELECT "id" FROM "roles" WHERE "nombre" = 'Administrador')`,
    );
    await queryRunner.query(`DELETE FROM "roles" WHERE "nombre" = 'Administrador'`);
    await queryRunner.query(`DELETE FROM "permisos" WHERE "codigo" = ANY($1::text[])`, [
      this.permisos.map(([codigo]) => codigo),
    ]);
  }
}
