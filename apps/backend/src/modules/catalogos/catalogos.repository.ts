import { tenantRepository } from '../../database/tenant-repository';
import { TipoDocumentoIdentidad } from './tipo-documento-identidad.entity';
import { TipoComprobante } from './tipo-comprobante.entity';
import { UnidadMedida } from './unidad-medida.entity';
import { TipoAfectacionIgv } from './tipo-afectacion-igv.entity';
import { TipoOperacion } from './tipo-operacion.entity';
import { MedioPago } from './medio-pago.entity';
import { Banco } from './banco.entity';

export const tipoDocumentoIdentidadRepository = tenantRepository(TipoDocumentoIdentidad);
export const tipoComprobanteRepository = tenantRepository(TipoComprobante);
export const unidadMedidaRepository = tenantRepository(UnidadMedida);
export const tipoAfectacionIgvRepository = tenantRepository(TipoAfectacionIgv);
export const tipoOperacionRepository = tenantRepository(TipoOperacion);
export const medioPagoRepository = tenantRepository(MedioPago);
export const bancoRepository = tenantRepository(Banco);
