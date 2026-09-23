import { createInterface } from 'node:readline/promises';

/**
 * Helpers de línea de comandos compartidos entre los scripts administrativos de este proyecto
 * (`cli-proveedor.ts`, `preflight-h01.ts`). Extraído para no duplicar la misma lectura de
 * argumentos y confirmación interactiva en cada script nuevo (Regla 7/8 de `CLAUDE.md`).
 */

export function leerArgumento(nombre: string): string | undefined {
  const bandera = `--${nombre}`;
  const indice = process.argv.indexOf(bandera);
  if (indice === -1 || indice === process.argv.length - 1) return undefined;
  return process.argv[indice + 1];
}

export function tieneBandera(nombre: string): boolean {
  return process.argv.includes(`--${nombre}`);
}

/**
 * Confirmación explícita antes de una operación destructiva/irreversible. En una terminal
 * interactiva pregunta y espera s/N; en un entorno sin TTY (CI, script de despliegue) **no
 * asume "sí"**: exige la bandera `--confirmar`/`--si` de antemano, o se niega a continuar.
 */
export async function confirmar(mensaje: string): Promise<boolean> {
  if (tieneBandera('confirmar') || tieneBandera('si')) return true;

  if (!process.stdin.isTTY) {
    console.error(
      'Este entorno no permite confirmar de forma interactiva. Repite el comando agregando ' +
        '--confirmar si de verdad quieres continuar.',
    );
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const respuesta = await rl.question(`${mensaje} [s/N] `);
    return respuesta.trim().toLowerCase() === 's';
  } finally {
    rl.close();
  }
}
