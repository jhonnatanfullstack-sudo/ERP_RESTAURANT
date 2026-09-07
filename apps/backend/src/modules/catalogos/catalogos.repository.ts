import { AppDataSource } from '../../database/data-source';
import { TipoDocumentoIdentidad } from './tipo-documento-identidad.entity';
import { TipoComprobante } from './tipo-comprobante.entity';
import { UnidadMedida } from './unidad-medida.entity';

export const tipoDocumentoIdentidadRepository = AppDataSource.getRepository(TipoDocumentoIdentidad);
export const tipoComprobanteRepository = AppDataSource.getRepository(TipoComprobante);
export const unidadMedidaRepository = AppDataSource.getRepository(UnidadMedida);
