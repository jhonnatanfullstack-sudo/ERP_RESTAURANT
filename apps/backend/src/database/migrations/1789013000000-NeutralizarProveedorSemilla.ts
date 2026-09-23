import bcrypt from 'bcrypt';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { activarBypassRls } from '../bypass-rls';

/**
 * H01 — Neutraliza el fallback inseguro de `UsuarioProveedor`/`CorregirMarcaProveedor` y
 * agrega la rotación obligatoria de contraseña (`docs/auditoria/BACKLOG-TECNICO.md`).
 *
 * No se editan esas dos migraciones históricas (ya corrieron en instalaciones reales, y la
 * regla de este proyecto es no tocar migraciones ya ejecutadas): en una instalación nueva,
 * `admin@restaurant.local` es la única fila de `usuarios` en el momento en que corren, así
 * que su `COALESCE(por PROVEEDOR_EMAIL, usuario más antiguo)` termina marcándola
 * `es_proveedor = true` siempre — sin que nadie lo haya decidido. Esta migración corre
 * después (en toda instalación, nueva o existente) y revierte ese resultado con una
 * comprobación que ninguna de las dos hacía: si la contraseña de esa cuenta sigue siendo el
 * placeholder ya público del propio repositorio, no hay ninguna decisión humana detrás — es
 * seguro neutralizarla. Si ya fue rotada, se asume que alguien la adoptó a propósito y solo
 * se advierte, sin tocar nada — mismo criterio de no revocar algo que pudo ser una decisión
 * real que ya usa `CorregirMarcaProveedor`.
 *
 * `bcrypt` usa una sal distinta en cada hash: comparar el hash guardado contra el de
 * `SeedRbacInicial` con `=` nunca daría igual aunque la contraseña fuera idéntica. La única
 * comparación válida es `bcrypt.compare(candidato, hashGuardado)`.
 *
 * H01-R03 (revisión Codex): identificar la cuenta solo por `email = 'admin@restaurant.local'`
 * deja de detectarla si alguien le cambió el email (ej. `PUT /api/usuarios/:id`) sin rotar la
 * contraseña — un caso real, no hipotético, porque nada impide editar el email de esa cuenta
 * hoy. La búsqueda usa en cambio la procedencia estructural que `SeedRbacInicial` deja en
 * `personal` (documento `00000000`, nombre `Administrador Sistema`, tipo de documento DNI) —
 * campos que ese mismo archivo comenta que hay que editar en la EMPRESA (`PUT
 * /api/empresas/:id`) y en la CONTRASEÑA, nunca menciona editar el nombre/documento del
 * personal semilla, así que es una base más estable que el email para encontrarla. El email
 * solo se usa después, para el mensaje de advertencia — nunca para decidir a quién mirar.
 */
export class NeutralizarProveedorSemilla1789013000000 implements MigrationInterface {
  name = 'NeutralizarProveedorSemilla1789013000000';

  /** El mismo literal que `SeedRbacInicial` hashea al crear la cuenta de arranque — ya es
   * público (está en ese archivo y en `docs/autenticacion.md`). Acá solo se usa para
   * comparar contra el hash guardado; nunca se persiste, se registra ni se muestra. */
  private readonly PLACEHOLDER_SEMILLA = 'CambiarInmediatamente123!';
  private readonly DOCUMENTO_SEMILLA = '00000000';
  private readonly NOMBRES_SEMILLA = 'Administrador';
  private readonly APELLIDO_PATERNO_SEMILLA = 'Sistema';
  private readonly CODIGO_TIPO_DOCUMENTO_DNI = '1';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Escribe en `usuarios`, que está bajo RLS: sin el bypass, en un Postgres gestionado esta
    // migración vería/afectaría cero filas y dejaría la neutralización sin aplicar en
    // silencio (mismo motivo por el que `UsuarioProveedor`/`CorregirMarcaProveedor` lo usan).
    await activarBypassRls(queryRunner);

    await queryRunner.query(
      `ALTER TABLE "usuarios" ADD COLUMN "debe_cambiar_password" boolean NOT NULL DEFAULT false`,
    );

    // Por procedencia (`personal`), no por email — ver el comentario de la clase.
    const filas: Array<{
      id: string;
      email: string;
      password_hash: string;
      es_proveedor: boolean;
    }> = await queryRunner.query(
      `SELECT u."id", u."email", u."password_hash", u."es_proveedor"
         FROM "usuarios" u
         JOIN "personal" p ON p."id" = u."personal_id"
         JOIN "tipos_documento_identidad" t ON t."id" = p."tipo_documento_identidad_id"
        WHERE p."numero_documento" = $1
          AND p."nombres" = $2
          AND p."apellido_paterno" = $3
          AND t."codigo" = $4`,
      [
        this.DOCUMENTO_SEMILLA,
        this.NOMBRES_SEMILLA,
        this.APELLIDO_PATERNO_SEMILLA,
        this.CODIGO_TIPO_DOCUMENTO_DNI,
      ],
    );

    if (filas.length === 0) {
      // Instalación sin la cuenta semilla (se borró a mano, o `SeedRbacInicial` nunca corrió
      // en este entorno): nada que neutralizar.
      return;
    }

    for (const fila of filas) {
      const siguePlaceholder = await bcrypt.compare(this.PLACEHOLDER_SEMILLA, fila.password_hash);

      if (siguePlaceholder) {
        await queryRunner.query(
          `UPDATE "usuarios" SET "es_proveedor" = false, "debe_cambiar_password" = true WHERE "id" = $1`,
          [fila.id],
        );
        continue;
      }

      if (fila.es_proveedor) {
        // La contraseña ya se rotó, pero la cuenta sigue marcada proveedor: podría ser una
        // adopción deliberada (alguien decidió seguir usando esta cuenta como su proveedor
        // real). No se revoca automáticamente — solo se deja constancia, sin ningún dato
        // sensible, para que el operador lo confirme a mano.
        console.warn(
          `[NeutralizarProveedorSemilla] La cuenta semilla ("${fila.email}") sigue marcada ` +
            'como proveedor y su contraseña ya no es la de arranque. No se modificó ' +
            'automáticamente: confirma a mano si esta cuenta es tu proveedor real ' +
            '(pnpm proveedor:listar).',
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se restaura `es_proveedor = true`: dejar el sistema sin ese privilegio asignado por
    // accidente es el estado correcto, no algo que revertir — mismo criterio que
    // `CorregirMarcaProveedor.down()`.
    await queryRunner.query(
      `ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "debe_cambiar_password"`,
    );
  }
}
