import { Router } from 'express';
import { sendSuccess } from '../../utils/api-response';
import { empresaRepository } from '../empresa/empresa.repository';
import { empresaPublica } from '../empresa/empresa.mapper';
import { empresaIdActual } from '../../database/tenant-context';
import { listarProductosPublico } from '../productos/producto.service';
import { obtenerConfiguracionPublica } from '../configuracion/configuracion.service';
import { resolverEmpresaPorSlug } from './carta-publica.middleware';

/**
 * Carta pública de un restaurante, sin autenticación: `/api/publico/:slug/...`.
 *
 * Reemplaza a `GET /api/empresas/publico` y `GET /api/productos/publico`, que devolvían "la
 * empresa activa más antigua" — una respuesta que dejó de tener sentido en cuanto hubo más
 * de un restaurante en el sistema.
 *
 * Los services que consultan por debajo son los mismos de siempre y no saben nada de esto:
 * el middleware fija la empresa de la petición y los repositorios ya filtran por ella.
 */
export const cartaPublicaRouter = Router();

cartaPublicaRouter.use('/:slug', resolverEmpresaPorSlug);

// El horario, las redes y el mensaje de bienvenida viajan junto a los datos de la empresa:
// la carta los necesita en el mismo momento y separarlos en dos endpoints obligaría al
// cliente a esperar dos viajes de red para pintar la cabecera.
cartaPublicaRouter.get('/:slug/empresa', (_req, res, next) => {
  Promise.all([
    empresaRepository.findOneBy({ id: empresaIdActual() }),
    obtenerConfiguracionPublica(),
  ])
    .then(([empresa, configuracion]) =>
      sendSuccess(res, empresa ? { ...empresaPublica(empresa), ...configuracion } : null),
    )
    .catch(next);
});

cartaPublicaRouter.get('/:slug/productos', (_req, res, next) => {
  listarProductosPublico()
    .then((productos) => sendSuccess(res, productos))
    .catch(next);
});
