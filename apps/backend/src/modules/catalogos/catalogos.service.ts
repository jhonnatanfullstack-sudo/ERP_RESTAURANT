import {
  medioPagoRepository,
  bancoRepository,
  tipoAfectacionIgvRepository,
  tipoComprobanteRepository,
  tipoDocumentoIdentidadRepository,
  tipoOperacionRepository,
  unidadMedidaRepository,
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
