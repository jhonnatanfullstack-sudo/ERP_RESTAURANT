import { PlanContratado } from '../empresa/empresa.entity';

export enum CicloFacturacion {
  MENSUAL = 'mensual',
  TRIMESTRAL = 'trimestral',
  ANUAL = 'anual',
}

export const MESES_POR_CICLO: Record<CicloFacturacion, number> = {
  [CicloFacturacion.MENSUAL]: 1,
  [CicloFacturacion.TRIMESTRAL]: 3,
  [CicloFacturacion.ANUAL]: 12,
};

interface DefinicionPlan {
  nombre: string;
  descripcion: string;
  /** Precio de lista, mensual, sin ningún descuento por ciclo. */
  precioMensual: number;
  caracteristicas: string[];
}

/**
 * Catálogo de planes comerciales (FASE 29). Precios fijados por el usuario a partir de un
 * relevamiento de mercado (competidores peruanos con SUNAT incluida: S/ 46–119/mes) — ver
 * `docs/decisiones-tecnicas.md`. Es una constante de código, no una tabla editable: son 3
 * planes fijos que solo cambian por una decisión de negocio explícita, igual criterio que
 * `TASA_IGV_GENERAL` en `empresa/igv.service.ts`.
 */
export const PLANES: Record<PlanContratado, DefinicionPlan> = {
  [PlanContratado.OPERATIVO]: {
    nombre: 'Operativo',
    descripcion: 'Para empezar a operar el día a día del salón.',
    precioMensual: 79,
    caracteristicas: [
      'Pedidos en mesa y para llevar',
      'Comandas y pantalla de cocina',
      'Ventas con IGV calculado',
      'Caja: apertura, cierre y movimientos',
      'Salones, mesas, clientes y reservas',
      'Carta pública con pedidos por WhatsApp',
      'Usuarios y roles ilimitados',
    ],
  },
  [PlanContratado.FACTURACION]: {
    nombre: 'Facturación electrónica',
    descripcion: 'Todo lo operativo, más boletas y facturas reales ante SUNAT.',
    precioMensual: 129,
    caracteristicas: [
      'Todo lo del plan Operativo',
      'Emisión electrónica de boletas y facturas a SUNAT',
      'Talonarios: varias series con su propio correlativo',
      'Ventas al crédito y cuentas por cobrar',
    ],
  },
  [PlanContratado.COMPLETO]: {
    nombre: 'Completo',
    descripcion: 'Todo el sistema: operación, facturación e inventario con costos.',
    precioMensual: 189,
    caracteristicas: [
      'Todo lo del plan Facturación electrónica',
      'Inventario: insumos, almacenes y kardex',
      'Recetas con descuento automático de insumos',
      'Proveedores y compras',
      'Costos, margen y food cost por plato',
      'Auditoría completa del sistema',
    ],
  },
};

/**
 * Precio final de un plan según el ciclo de pago, con el descuento por adelanto ya aplicado.
 * Trimestral: 8% de descuento. Anual: "2 meses gratis" (paga 10, usa 12) — el estándar de
 * facto del sector (ver investigación de mercado en `docs/decisiones-tecnicas.md`), más claro
 * para el cliente que un porcentaje.
 */
export function calcularMonto(plan: PlanContratado, ciclo: CicloFacturacion): number {
  const { precioMensual } = PLANES[plan];
  if (ciclo === CicloFacturacion.MENSUAL) return precioMensual;
  if (ciclo === CicloFacturacion.TRIMESTRAL) {
    return Math.round(precioMensual * 3 * 0.92 * 100) / 100;
  }
  return precioMensual * 10;
}

export interface PlanPublico extends DefinicionPlan {
  id: PlanContratado;
  precios: Record<CicloFacturacion, number>;
}

/** Catálogo completo con precios ya calculados por ciclo — lo que consume la página pública
 * de precios, para no repetir la tabla de precios en el frontend. */
export function listarPlanesPublico(): PlanPublico[] {
  return Object.values(PlanContratado).map((id) => ({
    id,
    ...PLANES[id],
    precios: {
      [CicloFacturacion.MENSUAL]: calcularMonto(id, CicloFacturacion.MENSUAL),
      [CicloFacturacion.TRIMESTRAL]: calcularMonto(id, CicloFacturacion.TRIMESTRAL),
      [CicloFacturacion.ANUAL]: calcularMonto(id, CicloFacturacion.ANUAL),
    },
  }));
}
