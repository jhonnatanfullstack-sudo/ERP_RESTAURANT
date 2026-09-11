import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Row-Level Security: el aislamiento entre empresas lo hace cumplir Postgres, no el código
 * de la aplicación (FASE 25).
 *
 * **Por qué no basta con filtrar en los services.** Un filtro escrito a mano en TypeScript
 * protege exactamente las consultas donde alguien se acordó de ponerlo. En un sistema con 32
 * services, consultas SQL crudas (Reportes, Costeo, Kardex) y módulos que se siguen
 * agregando, la pregunta no es *si* alguna vez se va a olvidar un filtro, sino cuándo — y el
 * costo de ese olvido no es un bug cualquiera: es que un restaurante vea las ventas de otro.
 * Con RLS, ese mismo olvido devuelve cero filas en vez de las de otra empresa.
 *
 * **Cómo funciona.** Cada petición abre una transacción y fija `app.empresa_id` con
 * `set_config(..., true)` (local a la transacción, ver `middlewares/tenant.middleware.ts`).
 * Las políticas comparan `empresa_id` contra ese ajuste.
 *
 * **Falla cerrado.** Si no hay ajuste, `NULLIF(...)::uuid` es NULL, la comparación da NULL
 * (no verdadero) y la política no deja pasar **ninguna** fila. Una consulta que se escape del
 * contexto de petición no ve datos de nadie, que es exactamente el comportamiento deseado.
 *
 * **`FORCE` incluye al dueño de las tablas.** Sin `FORCE`, el rol dueño (el que usa la app)
 * se saltaría las políticas y todo esto sería decorativo.
 *
 * **La salida de emergencia es explícita.** `app.bypass_rls = 'on'` desactiva las políticas
 * dentro de una transacción concreta. Lo usan solo el login (que busca un usuario por email
 * sin saber todavía a qué empresa pertenece), el alta de una demo (que crea las filas de una
 * empresa que aún no tiene usuarios) y el panel del proveedor (que por definición mira todas
 * las empresas) — ver `conBypassRls` en `database/tenant-context.ts`. **Toda migración
 * futura que lea o escriba datos de estas tablas tiene que activarlo**, porque corre sin
 * contexto de petición y de lo contrario no vería ninguna fila.
 */
export class RlsMultiEmpresa1789000100000 implements MigrationInterface {
  name = 'RlsMultiEmpresa1789000100000';

  /** Tablas cuya columna de tenant es `empresa_id`. */
  private readonly tablas = [
    'categorias',
    'marcas',
    'productos',
    'salones',
    'mesas',
    'clientes',
    'reservas',
    'pedidos',
    'detalle_pedidos',
    'comandas',
    'ventas',
    'detalle_ventas',
    'cajas',
    'movimientos_caja',
    'insumos',
    'receta_insumos',
    'existencias',
    'proveedores',
    'compras',
    'detalle_compras',
    'comprobantes_electronicos',
    'registros_auditoria',
    'cuotas_venta',
    'pagos_venta',
    'roles',
    'usuarios',
    'talonario_usuarios',
    'almacenes',
    'personal',
    'talonarios',
  ];

  /** Condición compartida por todas las políticas. Se repite en `USING` (qué filas se ven)
   * y en `WITH CHECK` (qué filas se pueden escribir): sin la segunda, una empresa no podría
   * leer las filas de otra pero sí podría crearle una. */
  private condicion(columna: string): string {
    return `(
      "${columna}" = NULLIF(current_setting('app.empresa_id', true), '')::uuid
      OR NULLIF(current_setting('app.bypass_rls', true), '') = 'on'
    )`;
  }

  private async habilitar(queryRunner: QueryRunner, tabla: string, columna: string): Promise<void> {
    await queryRunner.query(`ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE "${tabla}" FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY "aislamiento_empresa" ON "${tabla}"
        USING ${this.condicion(columna)}
        WITH CHECK ${this.condicion(columna)}
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of this.tablas) {
      await this.habilitar(queryRunner, tabla, 'empresa_id');
    }

    // La propia tabla de empresas se aísla por su clave primaria: una empresa solo puede
    // leerse y editarse a sí misma. El registro de demos, el login y el panel del proveedor
    // la alcanzan con el bypass explícito.
    await this.habilitar(queryRunner, 'empresas', 'id');

    // `refresh_tokens` queda deliberadamente fuera: se consulta por el hash del token
    // durante la renovación de sesión, cuando todavía no se sabe de qué empresa es la
    // petición. El hash es un secreto de 256 bits, no un identificador adivinable, así que
    // no hay superficie que aislar; y meterla obligaría a ampliar el uso del bypass, que es
    // justo lo que conviene mantener al mínimo.
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const tabla of [...this.tablas, 'empresas']) {
      await queryRunner.query(`DROP POLICY IF EXISTS "aislamiento_empresa" ON "${tabla}"`);
      await queryRunner.query(`ALTER TABLE "${tabla}" NO FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE "${tabla}" DISABLE ROW LEVEL SECURITY`);
    }
  }
}
