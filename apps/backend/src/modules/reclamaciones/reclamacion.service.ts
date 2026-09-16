import type { EntityManager } from 'typeorm';
import { HttpError } from '../../utils/http-error';
import { empresaIdActual, enTransaccion } from '../../database/tenant-context';
import { tipoDocumentoIdentidadRepository } from '../catalogos/catalogos.repository';
import { usuarioRepository } from '../usuarios/usuario.repository';
import { crearNotificacion } from '../notificaciones/notificacion.service';
import { TipoNotificacion } from '../notificaciones/notificacion.entity';
import { reclamacionRepository } from './reclamacion.repository';
import { EstadoReclamacion, Reclamacion, TipoReclamacion } from './reclamacion.entity';
import type { CrearReclamacionPublicaDto, ResponderReclamacionDto } from './reclamacion.dto';

const RELACIONES = {
  tipoDocumentoIdentidad: true,
  usuarioAtendio: { personal: true },
} as const;

export async function listarReclamaciones(): Promise<Reclamacion[]> {
  return reclamacionRepository.find({ relations: RELACIONES, order: { creadoEn: 'DESC' } });
}

export async function obtenerReclamacion(id: string): Promise<Reclamacion> {
  const reclamacion = await reclamacionRepository.findOne({ where: { id }, relations: RELACIONES });
  if (!reclamacion) {
    throw new HttpError(404, 'Reclamación no encontrada');
  }
  return reclamacion;
}

/** Índice único de `reclamaciones (empresa, numero)` — ver `reclamacion.entity.ts`. */
const INDICE_CORRELATIVO = 'IDX_un_correlativo_reclamacion_por_empresa';
const UNIQUE_VIOLATION = '23505';
const MAXIMO_REINTENTOS_CORRELATIVO = 3;

function esColisionDeCorrelativo(error: unknown): boolean {
  const driverError = (error as { driverError?: { code?: string; constraint?: string } })
    ?.driverError;
  return driverError?.code === UNIQUE_VIOLATION && driverError?.constraint === INDICE_CORRELATIVO;
}

/**
 * Siguiente número dentro de la misma transacción: bloquea la fila con el correlativo más
 * alto (no un `MAX()` — Postgres no permite `FOR UPDATE` junto con funciones de agregación)
 * para que dos reclamos enviados a la vez no terminen con el mismo número. Mismo criterio que
 * `talonario.service.ts: reservarNumero`, sin el concepto de talonario/serie que acá no aplica
 * (un reclamo no es un comprobante SUNAT). Sin filas todavía no hay nada que bloquear: el
 * primer reclamo arranca en 1, y si dos llegaran a la vez para una empresa sin ninguno
 * registrado, el índice único de abajo resuelve la colisión con un reintento.
 */
async function reservarNumero(manager: EntityManager, empresaId: string): Promise<number> {
  const ultima = await manager
    .createQueryBuilder(Reclamacion, 'reclamacion')
    .setLock('pessimistic_write')
    .where('reclamacion.empresa_id = :empresaId', { empresaId })
    .orderBy('reclamacion.numero', 'DESC')
    .limit(1)
    .getOne();
  return (ultima?.numero ?? 0) + 1;
}

/**
 * Registra un reclamo o queja desde la carta pública, sin autenticarse — ver
 * `carta-publica.routes.ts`. No exige que el consumidor sea cliente registrado ni que tenga
 * una compra de por medio: el reglamento del Libro de Reclamaciones lo prohíbe expresamente.
 */
export async function crearReclamacionPublica(
  dto: CrearReclamacionPublicaDto,
): Promise<Reclamacion> {
  const empresaId = empresaIdActual();
  const tipoDocumentoIdentidad = await tipoDocumentoIdentidadRepository.findOneBy({
    id: dto.tipoDocumentoIdentidadId,
  });
  if (!tipoDocumentoIdentidad) {
    throw new HttpError(400, 'El tipo de documento indicado no existe', [
      'tipoDocumentoIdentidadId inválido',
    ]);
  }

  const intentarGuardar = () =>
    enTransaccion(async (manager) => {
      const numero = await reservarNumero(manager, empresaId);
      const reclamacion = manager.create(Reclamacion, {
        numero,
        tipo: dto.tipo,
        consumidorNombres: dto.consumidorNombres,
        consumidorApellidos: dto.consumidorApellidos,
        tipoDocumentoIdentidad,
        consumidorNumeroDocumento: dto.consumidorNumeroDocumento,
        consumidorDomicilio: dto.consumidorDomicilio,
        consumidorEmail: dto.consumidorEmail,
        consumidorTelefono: dto.consumidorTelefono ?? null,
        esMenorEdad: dto.esMenorEdad ?? false,
        apoderadoNombre: dto.apoderadoNombre ?? null,
        apoderadoNumeroDocumento: dto.apoderadoNumeroDocumento ?? null,
        descripcionBien: dto.descripcionBien,
        montoReclamado: dto.montoReclamado ?? null,
        detalle: dto.detalle,
        pedido: dto.pedido,
      });
      return manager.save(Reclamacion, reclamacion);
    });

  for (let intento = 1; ; intento += 1) {
    try {
      const guardada = await intentarGuardar();
      const reclamacionCompleta = await obtenerReclamacion(guardada.id);
      await crearNotificacion({
        tipo: TipoNotificacion.RECLAMO_NUEVO,
        titulo: dto.tipo === TipoReclamacion.QUEJA ? 'Nueva queja' : 'Nuevo reclamo',
        mensaje: dto.descripcionBien,
        entidadTipo: 'reclamacion',
        entidadId: reclamacionCompleta.id,
      });
      return reclamacionCompleta;
    } catch (error) {
      if (!esColisionDeCorrelativo(error) || intento >= MAXIMO_REINTENTOS_CORRELATIVO) {
        if (esColisionDeCorrelativo(error)) {
          throw new HttpError(
            409,
            'Otro reclamo se registró al mismo tiempo. Vuelve a enviarlo, por favor.',
          );
        }
        throw error;
      }
    }
  }
}

export async function responderReclamacion(
  id: string,
  usuarioId: string,
  dto: ResponderReclamacionDto,
): Promise<Reclamacion> {
  const reclamacion = await obtenerReclamacion(id);
  const usuario = await usuarioRepository.findOneBy({ id: usuarioId });
  if (!usuario) {
    throw new HttpError(401, 'Usuario no encontrado');
  }

  reclamacion.respuestaProveedor = dto.respuestaProveedor;
  reclamacion.fechaRespuesta = new Date();
  reclamacion.estado = EstadoReclamacion.ATENDIDO;
  reclamacion.usuarioAtendio = usuario;
  await reclamacionRepository.save(reclamacion);
  return obtenerReclamacion(id);
}
