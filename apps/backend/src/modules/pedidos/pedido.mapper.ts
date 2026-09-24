import type { Pedido } from './pedido.entity';

/**
 * Vista pública de un pedido, para la respuesta de `POST /api/publico/:slug/pedidos`
 * (autopedido/delivery/recojo, sin autenticación) — H04.
 *
 * Construida con una ALLOWLIST explícita, nunca por depuración de la entidad completa
 * (`{ ...pedido }` + `delete`): así, aunque en el futuro `Pedido.cliente` viniera cargado por
 * error en ese flujo, esta función simplemente no lo lee ni lo referencia — no depende de
 * comprobar `cliente === null`, sino de que la propiedad `cliente` de la entidad de origen no
 * exista en ningún punto de este código.
 *
 * Campos incluidos, y por qué: son exactamente los que hoy verifica `carta-publica.test.ts` en
 * la respuesta de este mismo endpoint (`id`, `estado`, `canalOrigen`, `mesa.id`, `detalles`,
 * `direccionEntrega`), más `total` y la forma de `mesa` ya establecida por el endpoint público
 * de mesa (`GET /:slug/mesas/:id`, ver `pedido.dto.ts`/`carta-publica.routes.ts`) para no
 * inventar una segunda forma de "mesa pública". Deliberadamente NO se incluyen
 * `contactoNombre`/`contactoTelefono`/`medioPagoPreferido`/`vueltoPara`/`notas`: ningún test ni
 * código de frontend actual los lee de esta respuesta (el frontend solo usa `pedido.id`, ver
 * `BandejaPedidoFlotante.tsx`), y son datos de contacto que no hace falta reflejar de vuelta en
 * una respuesta pública aunque el propio remitente los haya escrito.
 */
export function pedidoPublico(pedido: Pedido) {
  return {
    id: pedido.id,
    estado: pedido.estado,
    canalOrigen: pedido.canalOrigen,
    mesa: pedido.mesa
      ? { id: pedido.mesa.id, numero: pedido.mesa.numero, salon: pedido.mesa.salon.nombre }
      : null,
    detalles: pedido.detalles.map((detalle) => ({
      productoId: detalle.producto.id,
      cantidad: detalle.cantidad,
      precioUnitario: detalle.precioUnitario,
      subtotal: detalle.subtotal,
      notas: detalle.notas,
    })),
    total: pedido.total,
    direccionEntrega: pedido.direccionEntrega,
  };
}

export type PedidoPublico = ReturnType<typeof pedidoPublico>;
