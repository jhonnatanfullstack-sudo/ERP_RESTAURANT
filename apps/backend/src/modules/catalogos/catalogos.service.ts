import { IsNull } from 'typeorm';
import {
  medioPagoRepository,
  bancoRepository,
  tipoAfectacionIgvRepository,
  tipoComprobanteRepository,
  tipoDocumentoIdentidadRepository,
  tipoOperacionRepository,
  unidadMedidaRepository,
  paisRepository,
  divisionAdministrativaRepository,
  motivoTrasladoRepository,
  modalidadTrasladoRepository,
  motivoNotaRepository,
} from './catalogos.repository';

export async function listarTiposDocumentoIdentidad() {
  return tipoDocumentoIdentidadRepository.find({
    where: { activo: true },
    order: { codigo: 'ASC' },
  });
}

export async function listarTiposComprobante() {
  return tipoComprobanteRepository.find({ where: { activo: true }, order: { codigo: 'ASC' } });
}

export async function listarUnidadesMedida() {
  return unidadMedidaRepository.find({ where: { activo: true }, order: { nombre: 'ASC' } });
}

export async function listarTiposAfectacionIgv() {
  return tipoAfectacionIgvRepository.find({ where: { activo: true }, order: { codigo: 'ASC' } });
}

export async function listarTiposOperacion() {
  return tipoOperacionRepository.find({ where: { activo: true }, order: { codigo: 'ASC' } });
}

export async function listarMediosPago() {
  return medioPagoRepository.find({ where: { activo: true }, order: { nombre: 'ASC' } });
}

export async function listarBancos() {
  return bancoRepository.find({ where: { activo: true }, order: { nombre: 'ASC' } });
}

export async function listarPaises() {
  return paisRepository.find({ where: { activo: true }, order: { nombre: 'ASC' } });
}

export async function listarMotivosTraslado() {
  return motivoTrasladoRepository.find({ where: { activo: true }, order: { codigo: 'ASC' } });
}

export async function listarModalidadesTraslado() {
  return modalidadTrasladoRepository.find({ where: { activo: true }, order: { codigo: 'ASC' } });
}

/** `tipoDocumento`: '07' trae los motivos de Nota de Crédito, '08' los de Nota de Débito. */
export async function listarMotivosNota(tipoDocumento: string) {
  return motivoNotaRepository.find({
    where: { tipoDocumento, activo: true },
    order: { codigo: 'ASC' },
  });
}

export interface FiltroDivisiones {
  paisId: string;
  /** `undefined`/`null` trae el primer nivel (departamentos) del país; con un id trae los
   * hijos directos de esa división (provincias de un departamento, distritos de una
   * provincia). */
  padreId?: string | null;
}

export async function listarDivisionesAdministrativas({ paisId, padreId }: FiltroDivisiones) {
  return divisionAdministrativaRepository.find({
    where: {
      pais: { id: paisId },
      padre: padreId ? { id: padreId } : IsNull(),
      activo: true,
    },
    order: { nombre: 'ASC' },
  });
}
