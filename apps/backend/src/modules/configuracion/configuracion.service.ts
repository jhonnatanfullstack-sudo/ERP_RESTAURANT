import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { empresaIdActual } from '../../database/tenant-context';
import { UPLOADS_DIR } from '../../config/uploads';
import { configuracionRepository } from './configuracion.repository';
import type { ActualizarConfiguracionDto } from './configuracion.dto';
import type { Configuracion } from './configuracion.entity';

export interface ConfiguracionResuelta {
  duracionReservaMinutos: number;
  segundosRefrescoCocina: number;
  diasCreditoPorDefecto: number;
  foodCostObjetivo: number;
  foodCostCritico: number;
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
  qrPagoYape: string | null;
  qrPagoPlin: string | null;
  fidelizacionActiva: boolean;
  solesPorPunto: number;
  valorCanjePunto: number;
}

/** Valores por defecto. Son los mismos que estaban escritos en el código antes de FASE 21,
 * para que una empresa que nunca toque esta pantalla se comporte exactamente igual que antes. */
export const CONFIGURACION_POR_DEFECTO: ConfiguracionResuelta = {
  duracionReservaMinutos: 90,
  segundosRefrescoCocina: 8,
  diasCreditoPorDefecto: 30,
  foodCostObjetivo: 35,
  foodCostCritico: 50,
  horarioAtencion: null,
  mensajeBienvenida: null,
  aceptaPedidosWhatsapp: true,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  qrPagoYape: null,
  qrPagoPlin: null,
  fidelizacionActiva: false,
  solesPorPunto: 10,
  valorCanjePunto: 0.1,
};

function aResuelta(configuracion: Configuracion | null): ConfiguracionResuelta {
  if (!configuracion) return { ...CONFIGURACION_POR_DEFECTO };
  return {
    duracionReservaMinutos: configuracion.duracionReservaMinutos,
    segundosRefrescoCocina: configuracion.segundosRefrescoCocina,
    diasCreditoPorDefecto: configuracion.diasCreditoPorDefecto,
    foodCostObjetivo: configuracion.foodCostObjetivo,
    foodCostCritico: configuracion.foodCostCritico,
    horarioAtencion: configuracion.horarioAtencion,
    mensajeBienvenida: configuracion.mensajeBienvenida,
    aceptaPedidosWhatsapp: configuracion.aceptaPedidosWhatsapp,
    facebookUrl: configuracion.facebookUrl,
    instagramUrl: configuracion.instagramUrl,
    tiktokUrl: configuracion.tiktokUrl,
    qrPagoYape: configuracion.qrPagoYape,
    qrPagoPlin: configuracion.qrPagoPlin,
    fidelizacionActiva: configuracion.fidelizacionActiva,
    solesPorPunto: configuracion.solesPorPunto,
    valorCanjePunto: configuracion.valorCanjePunto,
  };
}

/**
 * Configuración de la empresa de la petición. **Leer no crea la fila**: si la empresa nunca
 * guardó su configuración, devuelve los valores por defecto sin escribir nada. Una petición
 * de lectura no debería tener efectos secundarios, y así tampoco hace falta sembrar una fila
 * por cada empresa nueva ni hacer un backfill para las que ya existían.
 */
export async function obtenerConfiguracion(): Promise<ConfiguracionResuelta> {
  const configuracion = await configuracionRepository.findOneBy({
    empresa: { id: empresaIdActual() },
  });
  return aResuelta(configuracion);
}

export async function actualizarConfiguracion(
  dto: ActualizarConfiguracionDto,
): Promise<ConfiguracionResuelta> {
  const empresaId = empresaIdActual();
  const existente = await configuracionRepository.findOneBy({ empresa: { id: empresaId } });

  const configuracion = existente
    ? configuracionRepository.merge(existente, dto)
    : configuracionRepository.create({ ...CONFIGURACION_POR_DEFECTO, ...dto });

  return aResuelta(await configuracionRepository.save(configuracion));
}

/**
 * Subconjunto que la carta pública puede mostrar sin autenticación. Se enumera de forma
 * explícita en vez de devolver la configuración entera: los umbrales de food cost y los días
 * de crédito son información interna del negocio, no algo que deba viajar al celular de
 * cualquier comensal.
 */
export async function obtenerConfiguracionPublica(): Promise<{
  horarioAtencion: string | null;
  mensajeBienvenida: string | null;
  aceptaPedidosWhatsapp: boolean;
  facebookUrl: string | null;
  instagramUrl: string | null;
  tiktokUrl: string | null;
}> {
  const {
    horarioAtencion,
    mensajeBienvenida,
    aceptaPedidosWhatsapp,
    facebookUrl,
    instagramUrl,
    tiktokUrl,
  } = await obtenerConfiguracion();
  return {
    horarioAtencion,
    mensajeBienvenida,
    aceptaPedidosWhatsapp,
    facebookUrl,
    instagramUrl,
    tiktokUrl,
  };
}

export type MedioQrPago = 'yape' | 'plin';

async function eliminarArchivoQr(url: string | null): Promise<void> {
  if (!url) return;
  const nombreArchivo = url.split('/').pop();
  if (!nombreArchivo) return;
  await unlink(join(UPLOADS_DIR, 'qr-pago', nombreArchivo)).catch(() => undefined);
}

/** Guarda el QR estático de cobro de Yape o Plin — el que la propia app le muestra al
 * restaurante para cobrar, no uno generado por este sistema (eso exigiría una afiliación de
 * comercio con credenciales que no tenemos). Se exhibe en caja al elegir ese medio de pago. */
export async function actualizarQrPago(
  medio: MedioQrPago,
  archivo: Express.Multer.File,
): Promise<ConfiguracionResuelta> {
  const empresaId = empresaIdActual();
  const existente = await configuracionRepository.findOneBy({ empresa: { id: empresaId } });
  const url = `/uploads/qr-pago/${archivo.filename}`;

  await eliminarArchivoQr(existente ? (medio === 'yape' ? existente.qrPagoYape : existente.qrPagoPlin) : null);

  const cambios = medio === 'yape' ? { qrPagoYape: url } : { qrPagoPlin: url };
  const configuracion = existente
    ? configuracionRepository.merge(existente, cambios)
    : configuracionRepository.create({ ...CONFIGURACION_POR_DEFECTO, ...cambios });

  return aResuelta(await configuracionRepository.save(configuracion));
}
