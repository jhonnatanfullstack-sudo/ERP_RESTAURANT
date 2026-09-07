import {
  tipoComprobanteRepository,
  tipoDocumentoIdentidadRepository,
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
