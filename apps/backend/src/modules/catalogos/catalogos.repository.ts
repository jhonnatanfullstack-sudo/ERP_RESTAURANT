import { AppDataSource } from '../../database/data-source';
import { TipoDocumentoIdentidad } from './tipo-documento-identidad.entity';
import { TipoComprobante } from './tipo-comprobante.entity';

export const tipoDocumentoIdentidadRepository = AppDataSource.getRepository(TipoDocumentoIdentidad);
export const tipoComprobanteRepository = AppDataSource.getRepository(TipoComprobante);
