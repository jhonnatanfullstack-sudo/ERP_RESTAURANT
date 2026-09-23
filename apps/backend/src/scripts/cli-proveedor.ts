import 'reflect-metadata';
import { AppDataSource } from '../database/data-source';
import {
  asignarProveedor,
  quitarProveedor,
  listarProveedores,
} from '../modules/plataforma/proveedor-bootstrap.service';
import { confirmar, leerArgumento } from './cli-confirmacion';

/**
 * Bootstrap administrativo del proveedor de la plataforma (H01).
 *
 * Corre fuera de Express — nadie puede otorgar `es_proveedor` por HTTP, ni con un endpoint ni
 * con un token; solo quien tiene acceso al servidor para ejecutar un comando (mismo nivel de
 * confianza que correr una migración a mano). Uso:
 *
 *   pnpm proveedor:asignar --email correo@dominio.com
 *   pnpm proveedor:quitar  --email correo@dominio.com
 *   pnpm proveedor:listar
 *
 * Nunca imprime `password_hash` ni ningún secreto — solo email/estado, que es lo que
 * `ResumenProveedor` expone.
 *
 * Requiere que `migration:run` ya se haya ejecutado con éxito (necesita `es_proveedor` y
 * `debe_cambiar_password` en `usuarios`). Para resolver una instalación PRE-H01 con más de un
 * proveedor marcado, antes de poder migrar, ver `preflight-h01.ts` — herramienta distinta,
 * exclusiva de esa recuperación excepcional.
 */

async function main(): Promise<void> {
  const comando = process.argv[2];

  if (!['asignar', 'quitar', 'listar'].includes(comando)) {
    console.error(
      'Uso:\n' +
        '  pnpm proveedor:asignar --email correo@dominio.com\n' +
        '  pnpm proveedor:quitar  --email correo@dominio.com\n' +
        '  pnpm proveedor:listar',
    );
    process.exitCode = 1;
    return;
  }

  // No hace falta el registro de migraciones para esta operación; evita que TypeORM intente
  // cargar esas clases al conectar (mismo motivo que `tests/setup.ts`).
  AppDataSource.setOptions({ migrations: [] });
  await AppDataSource.initialize();

  try {
    if (comando === 'listar') {
      const proveedores = await listarProveedores();
      if (proveedores.length === 0) {
        console.log('No hay ningún usuario marcado como proveedor.');
      } else {
        for (const proveedor of proveedores) {
          console.log(`- ${proveedor.email} (${proveedor.activo ? 'activo' : 'inactivo'})`);
        }
      }
      return;
    }

    const email = leerArgumento('email');
    if (!email) {
      console.error('Falta --email <correo>');
      process.exitCode = 1;
      return;
    }

    if (comando === 'asignar') {
      const ok = await confirmar(`¿Marcar a "${email}" como proveedor de la plataforma?`);
      if (!ok) {
        console.log('Cancelado. No se realizó ningún cambio.');
        process.exitCode = 1;
        return;
      }
      const resultado = await asignarProveedor(email);
      console.log(`"${resultado.email}" queda marcado como proveedor.`);
      return;
    }

    // comando === 'quitar'
    const ok = await confirmar(`¿Quitarle a "${email}" la marca de proveedor?`);
    if (!ok) {
      console.log('Cancelado. No se realizó ningún cambio.');
      process.exitCode = 1;
      return;
    }
    const resultado = await quitarProveedor(email);
    console.log(`"${resultado.email}" ya no es proveedor.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
