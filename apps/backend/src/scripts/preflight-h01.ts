import { Client } from 'pg';
import { env } from '../config/env';
import { confirmar, leerArgumento } from './cli-confirmacion';
import {
  IdInvalidoError,
  ProveedorNoEnConflictoError,
  SinConflictoPreH01Error,
  resolverProveedorPreH01,
  verificarProveedoresPreH01,
} from './preflight-h01-core';
import type { ProveedorPreH01 } from './preflight-h01-core';

/**
 * Herramienta de recuperación EXCEPCIONAL para instalaciones PRE-H01 con más de un usuario
 * `es_proveedor = true` (`docs/auditoria/BACKLOG-TECNICO.md`, H01-R13). Ver el comentario de
 * cabecera de `preflight-h01-core.ts` para el porqué de que esto tenga que existir, y para el
 * porqué de identificar la cuenta a conservar por `id` (UUID) y no por email.
 *
 * Uso, SIEMPRE antes de correr `migration:run` por primera vez tras actualizar a H01:
 *
 *   pnpm preflight:h01 verificar
 *   pnpm preflight:h01 resolver --mantener-id <uuid>
 *
 * El email se muestra en ambos comandos solo como ayuda visual para que un humano reconozca la
 * cuenta — la operación de `resolver` se autoriza exclusivamente por `id`.
 *
 * Esto NO es el mecanismo normal para administrar el proveedor de la plataforma — para eso,
 * en cualquier instalación que ya corrió H01, usar `pnpm proveedor:asignar/quitar/listar`
 * (`cli-proveedor.ts`). Esta herramienta deja de ser necesaria en cuanto `migration:run`
 * termina con éxito una vez.
 *
 * Se conecta con las credenciales de DUEÑO (`DB_USER`/`DB_PASSWORD`) — las mismas con las que
 * corren las migraciones — porque necesita ver usuarios de todas las empresas a la vez, igual
 * que ellas.
 */

async function conectar(): Promise<Client> {
  const cliente = new Client({
    host: env.db.host,
    port: env.db.port,
    database: env.db.name,
    user: env.db.user,
    password: env.db.password,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : undefined,
  });
  await cliente.connect();
  return cliente;
}

function imprimirTabla(proveedores: ProveedorPreH01[]): void {
  console.log('ID                                    EMAIL');
  for (const proveedor of proveedores) {
    console.log(`${proveedor.id}  ${proveedor.email}`);
  }
}

/** Mensaje seguro para consola: nunca la config de conexión (tendría el password), solo el
 * mensaje del error — mismo criterio que ya usa `cli-proveedor.ts`. */
function mensajeSeguro(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ejecutarComando(cliente: Client, comando: string): Promise<void> {
  if (comando === 'verificar') {
    const enConflicto = await verificarProveedoresPreH01(cliente);

    if (enConflicto.length <= 1) {
      console.log(
        `OK: ${enConflicto.length} usuario(s) marcado(s) como proveedor. Puedes correr ` +
          '"migration:run" con normalidad.',
      );
      return;
    }

    console.error(
      `Hay ${enConflicto.length} usuarios marcados como proveedor a la vez. "migration:run" ` +
        'fallará (y revertirá TODA la migración pendiente, ver comentario de ' +
        'preflight-h01-core.ts) si lo corres ahora:\n',
    );
    imprimirTabla(enConflicto);
    console.error(
      '\nResuélvelo primero con:\n' +
        '  pnpm preflight:h01 resolver --mantener-id <el-id-que-corresponde>\n' +
        'y luego vuelve a correr "migration:run".',
    );
    process.exitCode = 1;
    return;
  }

  // comando === 'resolver'
  const mantenerId = leerArgumento('mantener-id');
  if (!mantenerId) {
    console.error('Falta --mantener-id <uuid>');
    process.exitCode = 1;
    return;
  }

  const enConflictoAntes = await verificarProveedoresPreH01(cliente);
  if (enConflictoAntes.length <= 1) {
    console.log(
      `No hay ningún conflicto que resolver: hay ${enConflictoAntes.length} usuario(s) ` +
        'marcado(s) como proveedor.',
    );
    return;
  }

  console.log('Usuarios marcados como proveedor ahora mismo:');
  imprimirTabla(enConflictoAntes);

  const ok = await confirmar(
    `¿Conservar el id "${mantenerId}" como proveedor y quitarle la marca a todos los demás listados arriba?`,
  );
  if (!ok) {
    console.log('Cancelado. No se realizó ningún cambio.');
    process.exitCode = 1;
    return;
  }

  const resultado = await resolverProveedorPreH01(cliente, { mantenerId });
  console.log(`"${resultado.mantenido.id}" (${resultado.mantenido.email}) queda como el único proveedor.`);
  for (const revocado of resultado.revocados) {
    console.log(`  - se le quitó la marca a "${revocado.id}" (${revocado.email})`);
  }
  console.log('\nAhora puedes correr "migration:run" con normalidad.');
}

/**
 * H01-R13 (revisión Codex, hallazgo BAJO) — mismo patrón que R12 (`realtime/socket.ts`):
 * `conectar()` y todo el ciclo de la operación viven dentro de un único `try`, con la conexión
 * cerrándose siempre en `finally` y sin que un fallo al cerrarla reemplace el error principal
 * (se registra aparte, nunca lo sustituye). El `.catch()` final sobre `main()` es la red de
 * seguridad definitiva: si algo escapara igual al try/catch de acá adentro, no queda ninguna
 * promesa sin manejar.
 */
async function main(): Promise<void> {
  const comando = process.argv[2];

  if (!['verificar', 'resolver'].includes(comando)) {
    console.error(
      'Uso:\n' +
        '  pnpm preflight:h01 verificar\n' +
        '  pnpm preflight:h01 resolver --mantener-id <uuid>',
    );
    process.exitCode = 1;
    return;
  }

  let cliente: Client | undefined;
  try {
    cliente = await conectar();
    await ejecutarComando(cliente, comando);
  } catch (error) {
    if (
      error instanceof SinConflictoPreH01Error ||
      error instanceof ProveedorNoEnConflictoError ||
      error instanceof IdInvalidoError
    ) {
      console.error(error.message);
    } else {
      console.error(mensajeSeguro(error));
    }
    process.exitCode = 1;
  } finally {
    if (cliente) {
      try {
        await cliente.end();
      } catch (errorAlCerrar) {
        console.error('No se pudo cerrar la conexión con normalidad:', mensajeSeguro(errorAlCerrar));
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error('Fallo inesperado no controlado:', mensajeSeguro(error));
  process.exitCode = 1;
});
