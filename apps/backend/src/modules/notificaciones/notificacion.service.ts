import { HttpError } from '../../utils/http-error';
import { alConfirmar, empresaIdActual } from '../../database/tenant-context';
import { emitirAEmpresa } from '../../realtime/socket';
import { notificacionRepository } from './notificacion.repository';
import { Notificacion, TipoNotificacion } from './notificacion.entity';

const LIMITE_LISTADO = 50;

export interface DatosNotificacion {
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  entidadTipo?: string;
  entidadId?: string;
}

/**
 * Crea una notificación para el equipo de la empresa en curso y la empuja por WebSocket a
 * quien tenga la campana abierta en ese momento (mismo canal que `cocina:comanda-actualizada`,
 * ver `realtime/socket.ts`) — la fila en la base es la fuente de verdad; el socket es solo
 * para no tener que esperar al próximo refresco.
 *
 * Se usa desde otros servicios (comanda, pedido público, reclamación), nunca se expone como
 * endpoint propio: nadie "crea" una notificación a mano, son un efecto de algo que ya pasó.
 */
export async function crearNotificacion(datos: DatosNotificacion): Promise<Notificacion> {
  const notificacion = notificacionRepository.create({
    tipo: datos.tipo,
    titulo: datos.titulo,
    mensaje: datos.mensaje,
    entidadTipo: datos.entidadTipo ?? null,
    entidadId: datos.entidadId ?? null,
  });
  const guardada = await notificacionRepository.save(notificacion);

  // Encolado con `alConfirmar` (ver `tenant-context.ts`) para no avisar por WebSocket de una
  // fila que un error más adelante en la misma petición podría revertir con un rollback.
  const empresaId = empresaIdActual();
  alConfirmar(() => emitirAEmpresa(empresaId, 'notificacion:nueva', guardada));

  return guardada;
}

export async function listarNotificaciones(): Promise<Notificacion[]> {
  return notificacionRepository.find({
    order: { creadoEn: 'DESC' },
    take: LIMITE_LISTADO,
  });
}

export async function contarNoLeidas(): Promise<number> {
  return notificacionRepository.count({ where: { leida: false } });
}

export async function marcarLeida(id: string): Promise<Notificacion> {
  const notificacion = await notificacionRepository.findOneBy({ id });
  if (!notificacion) {
    throw new HttpError(404, 'Notificación no encontrada');
  }
  notificacion.leida = true;
  return notificacionRepository.save(notificacion);
}

export async function marcarTodasLeidas(): Promise<void> {
  await notificacionRepository.update({ leida: false }, { leida: true });
}
