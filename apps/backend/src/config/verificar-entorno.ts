import { AppDataSource } from '../database/data-source';
import { env } from './env';
import { logger } from '../utils/logger';

/** Valores que trae `.env.example`: si alguno sobrevive a un despliegue, no es una
 * configuración, es un descuido. */
const VALORES_DE_EJEMPLO = ['changeme', 'cambia-esta-clave', 'tu-correo@ejemplo.com'];

/** Longitud mínima de un secreto JWT. Por debajo de esto, forzarlo deja de ser teórico. */
const LARGO_MINIMO_SECRETO = 32;

function esDeEjemplo(valor: string): boolean {
  return VALORES_DE_EJEMPLO.includes(valor.trim().toLowerCase());
}

/**
 * Comprobaciones de configuración al arrancar.
 *
 * En producción un problema encontrado acá **impide arrancar**: un servicio que no levanta se
 * nota en el primer despliegue y se arregla en minutos; uno que levanta mal configurado puede
 * estar meses filtrando datos o firmando tokens con `changeme` sin que nadie lo note. Fuera
 * de producción solo se avisa, para no estorbar el desarrollo.
 */
export async function verificarEntorno(): Promise<void> {
  const problemas: string[] = [];
  const avisos: string[] = [];
  const enProduccion = env.nodeEnv === 'production';

  // --- Secretos ----------------------------------------------------------------------
  const secretos: Array<[string, string]> = [
    ['JWT_ACCESS_SECRET', env.jwt.accessSecret],
    ['JWT_REFRESH_SECRET', env.jwt.refreshSecret],
    ['DB_APP_PASSWORD', env.db.appPassword],
  ];
  for (const [nombre, valor] of secretos) {
    if (esDeEjemplo(valor)) {
      problemas.push(`${nombre} sigue con el valor de ejemplo del .env.example`);
    } else if (nombre.startsWith('JWT') && valor.length < LARGO_MINIMO_SECRETO) {
      problemas.push(
        `${nombre} tiene ${valor.length} caracteres; usa al menos ${LARGO_MINIMO_SECRETO}`,
      );
    }
  }

  if (env.jwt.accessSecret === env.jwt.refreshSecret) {
    // Con el mismo secreto, un token de acceso caducado sirve como token de refresco: la
    // corta duración del primero deja de significar nada.
    problemas.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos');
  }

  // --- Exposición al exterior --------------------------------------------------------
  if (enProduccion) {
    if (env.corsOrigin.includes('localhost') || env.corsOrigin.includes('127.0.0.1')) {
      problemas.push(`CORS_ORIGIN apunta a localhost (${env.corsOrigin})`);
    }
    if (env.corsOrigin === '*') {
      problemas.push('CORS_ORIGIN no puede ser "*": las sesiones viajan en cookie');
    }
    if (env.trustProxy === 0) {
      // Sin esto el limitador ve la IP del balanceador y bloquea a todos los visitantes
      // juntos, o no limita a nadie. Ver docs/despliegue.md.
      avisos.push('TRUST_PROXY está en 0: si hay un balanceador delante, ponlo en 1');
    }
    if (!env.proveedor.email && !env.proveedor.telefono) {
      // El restaurante vería "tu prueba terminó" sin a quién escribirle.
      avisos.push('PROVEEDOR_EMAIL y PROVEEDOR_TELEFONO están vacíos');
    }
    if (!env.cifrado.claveBase64) {
      // No impide arrancar (la facturación electrónica es opcional), pero sin esto ninguna
      // empresa puede configurar su certificado/credenciales del OSE.
      avisos.push('CIFRADO_CLAVE está vacía: la facturación electrónica no estará disponible');
    }
  }

  // --- Aislamiento entre empresas ----------------------------------------------------
  // Esta es la comprobación más importante del arranque. El aislamiento se apoya en las
  // políticas RLS de Postgres, y **un superusuario se las salta siempre**, incluso con
  // `FORCE ROW LEVEL SECURITY`. Si la aplicación se conecta con un rol así, el sistema
  // funciona con normalidad y sin ningún síntoma visible, pero cualquier restaurante puede
  // leer los datos de los demás. Es exactamente el error que apareció al construir la FASE
  // 25, y no se detectó hasta comprobarlo contra la base.
  try {
    const [rol]: Array<{ rolsuper: boolean; rolbypassrls: boolean }> = await AppDataSource.query(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    if (rol?.rolsuper || rol?.rolbypassrls) {
      problemas.push(
        `El rol de base de datos "${env.db.appUser}" se salta las políticas RLS ` +
          `(${rol.rolsuper ? 'SUPERUSER' : ''}${rol.rolsuper && rol.rolbypassrls ? ' y ' : ''}${rol.rolbypassrls ? 'BYPASSRLS' : ''}): ` +
          'el aislamiento entre empresas NO está activo. Ver docs/despliegue.md, sección 1.1',
      );
    }
  } catch (error) {
    avisos.push('No se pudo verificar el rol de base de datos');
    logger.debug('Fallo al consultar pg_roles', { error: String(error) });
  }

  avisos.forEach((aviso) => logger.warn(`Configuración: ${aviso}`));

  if (problemas.length === 0) {
    logger.info('Configuración verificada', { entorno: env.nodeEnv });
    return;
  }

  problemas.forEach((problema) => logger.error(`Configuración: ${problema}`));

  if (enProduccion) {
    throw new Error(
      `El servidor no puede arrancar en producción con ${problemas.length} problema(s) de configuración (ver arriba).`,
    );
  }
  logger.warn('Se continúa porque el entorno no es producción');
}
