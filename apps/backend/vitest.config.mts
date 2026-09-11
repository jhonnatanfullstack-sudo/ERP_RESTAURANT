import { defineConfig } from 'vitest/config';

/**
 * Pruebas integrales del backend (FASE 22).
 *
 * **Corren contra un PostgreSQL real**, no contra mocks, y eso es deliberado: las garantías
 * más importantes de este sistema viven *dentro* de la base — las políticas RLS que aíslan a
 * una empresa de otra, los índices únicos del correlativo de comprobantes y de la caja
 * abierta, el `CHECK` del food cost. Una prueba con el repositorio simulado verificaría que
 * el código llama a TypeORM, no que un restaurante no puede leer las ventas de otro, que es
 * lo que en realidad hay que garantizar.
 *
 * Es también la lección de los tres errores encontrados al construir las FASES 25-26: el rol
 * superusuario que se saltaba RLS, la transacción que confirmaba después de responder y la
 * migración que no marcaba a nadie. Ninguno era detectable sin una base de verdad.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    // Los archivos comparten una única base de datos, así que corren en serie: en paralelo
    // uno borraría los datos que otro está leyendo. Una base por archivo daría paralelismo a
    // cambio de multiplicar el costo de migrar en cada arranque.
    fileParallelism: false,
    // Recrear y migrar la base desde cero toma unos segundos al arrancar.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // Base separada: las pruebas la recrean en cada ejecución y no pueden tocar la de
      // desarrollo. `dotenv` no pisa las variables ya definidas, así que esto gana sobre el
      // `.env` del proyecto.
      DB_NAME: 'restaurant_erp_test',
    },
  },
});
