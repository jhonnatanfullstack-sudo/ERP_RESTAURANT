import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sendSuccess } from '../../utils/api-response';
import { validateBody, validateUuidParam } from '../../middlewares/validate.middleware';
import { empresaRepository } from '../empresa/empresa.repository';
import { empresaPublica, empresaParaReclamaciones } from '../empresa/empresa.mapper';
import { empresaIdActual } from '../../database/tenant-context';
import { listarProductosPublico } from '../productos/producto.service';
import { obtenerConfiguracionPublica } from '../configuracion/configuracion.service';
import { obtenerMesa } from '../mesas/mesa.service';
import { crearPedidoPublico } from '../pedidos/pedido.service';
import { crearPedidoPublicoSchema } from '../pedidos/pedido.dto';
import { pedidoPublico } from '../pedidos/pedido.mapper';
import { crearReclamacionPublica } from '../reclamaciones/reclamacion.service';
import { crearReclamacionPublicaSchema } from '../reclamaciones/reclamacion.dto';
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

// Para mostrar "Mesa 5" antes de pedir, y para que un QR viejo o manipulado falle temprano
// con un mensaje claro en vez de recién al enviar el pedido.
cartaPublicaRouter.get('/:slug/mesas/:mesaId', validateUuidParam('mesaId'), (req, res, next) => {
  obtenerMesa(req.params.mesaId as string)
    .then((mesa) => sendSuccess(res, { id: mesa.id, numero: mesa.numero, salon: mesa.salon.nombre }))
    .catch(next);
});

/**
 * Alta de un pedido sin autenticarse (autopedido en mesa, delivery o recojo) desde la carta
 * pública. Es, junto con el registro de demos, el otro endpoint de escritura sin sesión del
 * sistema: mismo criterio de límite estricto por IP para que no se llene `pedidos` de basura.
 * El pedido queda "abierto" a la espera de que el staff lo revise: nunca llega solo a cocina
 * (ver `pedido.service.ts: crearPedidoPublico`).
 */
const pedidoPublicoRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados pedidos desde esta conexión, intenta de nuevo más tarde',
    details: [],
  },
});

cartaPublicaRouter.post(
  '/:slug/pedidos',
  pedidoPublicoRateLimit,
  validateBody(crearPedidoPublicoSchema),
  (req, res, next) => {
    crearPedidoPublico(req.body)
      .then((pedido) => sendSuccess(res, pedidoPublico(pedido), 'Pedido enviado', 201))
      .catch(next);
  },
);

// Datos del proveedor para la cabecera del Libro de Reclamaciones: a diferencia de la carta,
// acá el RUC y la razón social sí son lo que el consumidor necesita ver (contra quién está
// reclamando), ver `empresa.mapper.ts: empresaParaReclamaciones`.
cartaPublicaRouter.get('/:slug/reclamaciones/empresa', (_req, res, next) => {
  empresaRepository
    .findOneBy({ id: empresaIdActual() })
    .then((empresa) => sendSuccess(res, empresa ? empresaParaReclamaciones(empresa) : null))
    .catch(next);
});

/**
 * Alta de un reclamo/queja en el Libro de Reclamaciones Virtual, sin autenticarse — el
 * reglamento prohíbe exigirle al consumidor ser cliente registrado. Mismo límite por IP que el
 * resto de los endpoints de escritura públicos, para que no se llene de basura automatizada.
 */
const reclamacionPublicaRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  skip: () => process.env.NODE_ENV === 'test',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Demasiados envíos desde esta conexión, intenta de nuevo más tarde',
    details: [],
  },
});

cartaPublicaRouter.post(
  '/:slug/reclamaciones',
  reclamacionPublicaRateLimit,
  validateBody(crearReclamacionPublicaSchema),
  (req, res, next) => {
    crearReclamacionPublica(req.body)
      .then((reclamacion) => sendSuccess(res, reclamacion, 'Reclamo registrado', 201))
      .catch(next);
  },
);
