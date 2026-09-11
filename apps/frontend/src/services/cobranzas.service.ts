import { api } from './api';
import type { ApiSuccess, Cobranza } from '../types/api';

export interface RegistrarPagoInput {
  fechaPago: string;
  monto: number;
  medioPagoId: string;
  /** Obligatorios cuando el medio de pago es bancarizado (`MedioPago.requiereBanco`). */
  bancoId?: string;
  numeroOperacion?: string;
  observacion?: string;
}

/** Documentos por cobrar. `soloPendientes` deja fuera los ya cancelados. */
export async function listarCuentasPorCobrar(soloPendientes = false) {
  const res = await api.get<ApiSuccess<Cobranza[]>>('/api/cuentas-por-cobrar', {
    params: soloPendientes ? { pendientes: 'true' } : undefined,
  });
  return res.data.data;
}

export async function obtenerCobranza(ventaId: string) {
  const res = await api.get<ApiSuccess<Cobranza>>(`/api/cuentas-por-cobrar/${ventaId}`);
  return res.data.data;
}

export async function registrarPago(ventaId: string, input: RegistrarPagoInput) {
  const res = await api.post<ApiSuccess<Cobranza>>(
    `/api/cuentas-por-cobrar/${ventaId}/pagos`,
    input,
  );
  return res.data.data;
}

export async function anularPago(pagoId: string, motivo: string) {
  const res = await api.delete<ApiSuccess<Cobranza>>(`/api/pagos-venta/${pagoId}`, {
    data: { motivo },
  });
  return res.data.data;
}
