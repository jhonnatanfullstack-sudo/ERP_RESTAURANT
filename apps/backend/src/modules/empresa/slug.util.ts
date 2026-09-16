import { HttpError } from '../../utils/http-error';
import { empresaRepository } from './empresa.repository';

/** Prefijos de ruta reservados del sistema: un slug no puede coincidir con ninguno, o
 * `/carta/:slug` chocaría contra una ruta real de la API o del frontend. */
export const SLUG_RESERVADOS = ['api', 'admin', 'login', 'carta', 'demo', 'proveedor', 'uploads'];

/**
 * Convierte el nombre del restaurante en un slug para la URL pública de su carta. Se prefiere
 * al RUC a propósito: un RUC (`20123456789`) no se lee ni se dicta por teléfono, y no aporta
 * nada — ya es información pública consultable en SUNAT, así que ponerlo en la URL no suma
 * privacidad, solo la hace ver burocrática. `/carta/el-fogon` sí es memorable y compartible.
 *
 * Quita tildes y todo lo que no sea letra, número o guion.
 */
export function generarSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/**
 * Busca un slug libre. Dos restaurantes pueden llamarse igual, así que si el natural está
 * tomado se le agrega un sufijo numérico en vez de fallar el alta/edición por algo que no es
 * culpa de quien lo pidió.
 *
 * `idExcluido` es para cuando se resuelve el slug de una empresa que ya existe (editar su
 * propio nombre no debe chocar contra su propio slug actual).
 */
export async function resolverSlugDisponible(base: string, idExcluido?: string): Promise<string> {
  const raiz = base || 'restaurante';
  for (let intento = 0; intento < 50; intento += 1) {
    const candidato = intento === 0 ? raiz : `${raiz}-${intento + 1}`;
    if (SLUG_RESERVADOS.includes(candidato)) continue;
    const tomado = await empresaRepository.findOneBy({ slug: candidato });
    if (!tomado || tomado.id === idExcluido) return candidato;
  }
  throw new HttpError(
    409,
    'No se pudo generar una dirección para tu carta, intenta con otro nombre',
  );
}
