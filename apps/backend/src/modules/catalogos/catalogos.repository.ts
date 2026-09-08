import { AppDataSource } from '../../database/data-source';
import { TipoDocumentoIdentidad } from './tipo-documento-identidad.entity';
import { TipoComprobante } from './tipo-comprobante.entity';
import { UnidadMedida } from './unidad-medida.entity';
import { TipoAfectacionIgv } from './tipo-afectacion-igv.entity';
import { TipoOperacion } from './tipo-operacion.entity';
import { MedioPago } from './medio-pago.entity';

export const tipoDocumentoIdentidadRepository = AppDataSource.getRepository(TipoDocumentoIdentidad);
export const tipoComprobanteRepository = AppDataSource.getRepository(TipoComprobante);
export const unidadMedidaRepository = AppDataSource.getRepository(UnidadMedida);
export const tipoAfectacionIgvRepository = AppDataSource.getRepository(TipoAfectacionIgv);
export const tipoOperacionRepository = AppDataSource.getRepository(TipoOperacion);
export const medioPagoRepository = AppDataSource.getRepository(MedioPago);
