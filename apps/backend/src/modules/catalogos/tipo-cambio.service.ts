import { env } from '../../config/env';

export interface TipoCambio {
  fecha: string;
  compra: number;
  venta: number;
}

/**
 * Consulta el tipo de cambio USD/PEN publicado por SUNAT para una fecha dada, vía el
 * mismo proveedor (Decolecta) que ya se usa para RENIEC/SUNAT en consulta-documento.service.ts.
 * A diferencia de esa consulta (iniciada por el usuario, con error visible si falla), esta se
 * usa para enriquecer una Venta automáticamente al emitirla: si no hay token configurado o la
 * consulta falla por cualquier motivo, se devuelve `null` y la venta se registra igual sin tipo
 * de cambio — no tiene sentido bloquear una venta en soles por un dato de referencia opcional.
 */
export async function consultarTipoCambio(fecha: Date): Promise<TipoCambio | null> {
  if (!env.apisNetPe.token) return null;

  const fechaStr = fecha.toISOString().slice(0, 10);
  const url = `${env.apisNetPe.baseUrl}/tipo-cambio/sunat?date=${fechaStr}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${env.apisNetPe.token}` },
      signal: controller.signal,
    });
    if (!respuesta.ok) return null;

    const datos = (await respuesta.json()) as Record<string, unknown>;
    const compra = Number(datos.buy_price);
    const venta = Number(datos.sell_price);
    if (!Number.isFinite(compra) || !Number.isFinite(venta)) return null;

    return { fecha: String(datos.date ?? fechaStr), compra, venta };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
