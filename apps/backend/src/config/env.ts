import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../../.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno faltante: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  /**
   * Cuántos proxies hay delante de la aplicación. En cualquier PaaS (Render, Railway, Fly,
   * Vercel) el tráfico entra por un balanceador, así que sin esto Express ve la IP del
   * proxy en vez de la del visitante: el limitador de peticiones contaría a todo el mundo
   * como un solo cliente y bloquearía a todos juntos. `0` en local, donde no hay proxy.
   */
  trustProxy: Number(process.env.TRUST_PROXY ?? 0),
  cookies: {
    /** `true` cuando el frontend vive en un dominio distinto al del backend (lo habitual al
     * desplegar). Ver `config/cookies.ts` — sin esto la sesión no sobrevive a un refresco
     * de página en producción. */
    crossSite: process.env.COOKIE_CROSS_SITE === 'true',
  },
  db: {
    host: requireEnv('DB_HOST'),
    port: Number(requireEnv('DB_PORT')),
    name: requireEnv('DB_NAME'),
    /** Dueño de las tablas. Solo lo usan las migraciones: es superusuario y por lo tanto
     * **se salta las políticas RLS**, que es justo lo que un backfill necesita y lo que la
     * aplicación no debe poder hacer nunca. */
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    /** Rol con el que la aplicación atiende peticiones: sin `SUPERUSER` ni `BYPASSRLS`, así
     * que está sujeto al aislamiento entre empresas. Ver
     * `migrations/…-RolAplicacionSinBypassRls.ts`. */
    appUser: requireEnv('DB_APP_USER'),
    appPassword: requireEnv('DB_APP_PASSWORD'),
    /** La base de datos local de Docker no usa TLS; un Postgres gestionado (Neon, Supabase,
     * RDS…) lo exige siempre. No se infiere de `NODE_ENV`: un VPS con Postgres propio en
     * `production` puede seguir sin TLS, así que es una decisión explícita, igual que
     * `cookies.crossSite`. `rejectUnauthorized: false` no desactiva TLS — solo no valida el
     * certificado contra una CA local, que es lo que exige la mayoría de estos proveedores. */
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    accessSecret: requireEnv('JWT_ACCESS_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshSecret: requireEnv('JWT_REFRESH_SECRET'),
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000,
  },
  /** Datos de contacto del proveedor del sistema (tú). Se le muestran al restaurante cuando
   * su demo vence o su cuenta queda suspendida, para que sepa con quién continuar. Van por
   * variable de entorno y no fijos en el código porque quien despliega el sistema no tiene
   * por qué ser quien lo escribió. */
  proveedor: {
    nombre: process.env.PROVEEDOR_NOMBRE ?? 'el proveedor del sistema',
    email: process.env.PROVEEDOR_EMAIL ?? null,
    telefono: process.env.PROVEEDOR_TELEFONO ?? null,
  },
  /** Días que dura una cuenta de prueba creada desde el registro público. */
  demo: {
    diasDePrueba: Number(process.env.DEMO_DIAS_DE_PRUEBA ?? 15),
  },
  apisNetPe: {
    baseUrl: process.env.APIS_NET_PE_BASE_URL ?? 'https://api.decolecta.com/v1',
    token: process.env.APIS_NET_PE_TOKEN ?? null,
  },
  /** Clave con la que se cifra en reposo el certificado digital y las credenciales del OSE de
   * cada empresa (FASE 28) — nunca se guardan en texto plano en la base de datos. Opcional a
   * nivel de arranque (ver `apisNetPe.token`): el sistema funciona igual sin facturación
   * electrónica configurada; `utils/cifrado.ts` es quien exige que exista al usarla. */
  cifrado: {
    claveBase64: process.env.CIFRADO_CLAVE ?? null,
  },
};
