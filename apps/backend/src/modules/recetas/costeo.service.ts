import { HttpError } from '../../utils/http-error';
import { productoRepository } from '../productos/producto.repository';
import { TipoProducto } from '../productos/producto.entity';
import { esGravado, resolverTasaIgv } from '../empresa/igv.service';
import { obtenerCostosNetos } from '../inventario/existencia.service';
import { recetaInsumoRepository } from './receta.repository';
import type { CostoNeto, CostosNetos, OrigenCosto } from '../inventario/existencia.service';
import type { Producto } from '../productos/producto.entity';
import type { RecetaInsumo } from './receta-insumo.entity';

const RELACIONES_PRODUCTO = { categoria: true, tipoAfectacionIgv: true } as const;

/** `sin_receta`: un platillo al que no se le cargó qué insumos consume.
 *  `sin_costos`: sí hay qué costear, pero ningún componente tiene costo de compra conocido. */
export type MotivoSinCosteo = 'sin_receta' | 'sin_costos';

export interface LineaCosteo {
  insumoId: string;
  nombre: string;
  unidadMedida: string;
  cantidad: number;
  /** Costo unitario neto de IGV del insumo, o `null` si nunca se compró con costo. */
  costoUnitario: number | null;
  costoLinea: number | null;
  origenCosto: OrigenCosto | null;
}

export interface CosteoProducto {
  productoId: string;
  nombre: string;
  tipo: TipoProducto;
  categoria: { id: string; nombre: string };
  /** Precio de carta, con IGV incluido (misma convención que `Producto.precio`). */
  precio: number;
  /** Precio sin IGV — lo que realmente le queda al negocio por vender una unidad. */
  valorVenta: number;
  /** Costo neto de una unidad: suma de la receta, o el último costo de compra si es
   * mercadería. `null` cuando no hay ni un solo componente costeado. */
  costo: number | null;
  /** `false` si algún componente no tiene costo conocido: el costo mostrado es un piso, no
   * el costo real, y el margen está sobreestimado. */
  costoCompleto: boolean;
  /** Nombres de los componentes sin costo, para explicar por qué el costeo está incompleto. */
  componentesSinCosto: string[];
  margen: number | null;
  /** Margen sobre el valor de venta, en porcentaje. */
  margenPorcentaje: number | null;
  /** Costo sobre el valor de venta, en porcentaje — el "food cost" con el que se mide un
   * restaurante (referencia habitual del rubro: 25%-35%). */
  costoPorcentaje: number | null;
  /** Por qué este producto no se puede costear todavía, o `null` si sí se puede. Se informa
   * explícitamente (en vez de dejarlo como margen del 100%) porque son los dos pendientes de
   * configuración más frecuentes: un platillo al que nunca se le cargó la receta, y un ítem
   * que nunca se compró con costo registrado. */
  motivoSinCosteo: MotivoSinCosteo | null;
  /** De dónde viene el costo: `manual` avisa que salió de un movimiento tipeado a mano, sin
   * el desglose de IGV de un comprobante — en un platillo basta con que una línea lo sea. */
  origenCosto: OrigenCosto | null;
  /** Desglose de la receta. Vacío para una mercadería, que no tiene insumos sino costo propio. */
  lineas: LineaCosteo[];
}

export interface ResumenCosteo {
  tasaIgv: number;
  /** Cuántos productos activos no se pueden costear todavía (sin receta, o sin ningún costo). */
  sinCostear: number;
  /** Margen promedio ponderado por precio de los productos que sí se pudieron costear por
   * completo — un promedio simple daría el mismo peso a una gaseosa que a un menú. */
  margenPromedioPorcentaje: number | null;
  productos: CosteoProducto[];
}

function redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/** Costeo de una mercadería: no tiene receta, su costo es el de su propia última compra. */
function costearMercaderia(producto: Producto, costo: CostoNeto | undefined) {
  return {
    costo: costo ? costo.costo : null,
    costoCompleto: costo !== undefined,
    componentesSinCosto: costo ? [] : [producto.nombre],
    origenCosto: costo?.origen ?? null,
    lineas: [] as LineaCosteo[],
  };
}

/** Costeo de un platillo: la suma de sus insumos por la cantidad que consume una unidad. */
function costearServicio(lineasReceta: RecetaInsumo[], costos: CostosNetos) {
  const lineas: LineaCosteo[] = lineasReceta.map((linea) => {
    const costo = costos.insumos.get(linea.insumo.id);
    return {
      insumoId: linea.insumo.id,
      nombre: linea.insumo.nombre,
      unidadMedida: linea.insumo.unidadMedida.nombre,
      cantidad: linea.cantidad,
      costoUnitario: costo?.costo ?? null,
      costoLinea: costo ? redondear(costo.costo * linea.cantidad) : null,
      origenCosto: costo?.origen ?? null,
    };
  });

  const conCosto = lineas.filter((linea) => linea.costoLinea !== null);
  return {
    // Basta una línea tipeada a mano para que el costo total deje de venir de comprobantes.
    origenCosto:
      conCosto.length === 0
        ? null
        : conCosto.some((l) => l.origenCosto === 'manual')
          ? ('manual' as const)
          : ('compra' as const),
    // Con cero líneas costeadas el costo es desconocido, no cero: informar "S/ 0.00" haría
    // ver un margen del 100% en un platillo que simplemente no está configurado.
    costo: conCosto.length > 0 ? redondear(conCosto.reduce((s, l) => s + l.costoLinea!, 0)) : null,
    costoCompleto: lineas.length > 0 && conCosto.length === lineas.length,
    componentesSinCosto: lineas.filter((l) => l.costoLinea === null).map((l) => l.nombre),
    lineas,
  };
}

function motivoSinCosteo(
  producto: Producto,
  lineasReceta: RecetaInsumo[],
  costo: number | null,
): MotivoSinCosteo | null {
  if (producto.tipo === TipoProducto.SERVICIO && lineasReceta.length === 0) return 'sin_receta';
  return costo === null ? 'sin_costos' : null;
}

function armarCosteo(
  producto: Producto,
  lineasReceta: RecetaInsumo[],
  costos: CostosNetos,
  tasaIgv: number,
): CosteoProducto {
  // El precio de carta incluye IGV cuando el producto es gravado: el margen se mide contra
  // el valor de venta (lo que queda tras entregarle el IGV a SUNAT), no contra el precio.
  const valorVenta = esGravado(producto.tipoAfectacionIgv)
    ? redondear(producto.precio / (1 + tasaIgv))
    : producto.precio;

  const { costo, costoCompleto, componentesSinCosto, origenCosto, lineas } =
    producto.tipo === TipoProducto.MERCADERIA
      ? costearMercaderia(producto, costos.productos.get(producto.id))
      : costearServicio(lineasReceta, costos);

  const margen = costo === null ? null : redondear(valorVenta - costo);

  return {
    productoId: producto.id,
    nombre: producto.nombre,
    tipo: producto.tipo,
    categoria: { id: producto.categoria.id, nombre: producto.categoria.nombre },
    precio: producto.precio,
    valorVenta,
    costo,
    costoCompleto,
    componentesSinCosto,
    margen,
    // Un producto de precio 0 (una cortesía) no tiene porcentaje definido: dividir daría
    // Infinity y rompería cualquier orden o promedio aguas abajo.
    margenPorcentaje:
      margen === null || valorVenta === 0 ? null : redondear((margen / valorVenta) * 100),
    costoPorcentaje:
      costo === null || valorVenta === 0 ? null : redondear((costo / valorVenta) * 100),
    motivoSinCosteo: motivoSinCosteo(producto, lineasReceta, costo),
    origenCosto,
    lineas,
  };
}

async function recetasPorProducto(): Promise<Map<string, RecetaInsumo[]>> {
  const lineas = await recetaInsumoRepository.find({
    relations: { producto: true, insumo: { unidadMedida: true } },
    order: { insumo: { nombre: 'ASC' } },
  });
  const porProducto = new Map<string, RecetaInsumo[]>();
  for (const linea of lineas) {
    const existentes = porProducto.get(linea.producto.id);
    if (existentes) existentes.push(linea);
    else porProducto.set(linea.producto.id, [linea]);
  }
  return porProducto;
}

/**
 * Costo, margen y food cost de cada producto activo de la carta (FASE 18).
 *
 * Es informativo y siempre recalculado al vuelo: no se persiste un costo "congelado" por
 * producto porque el costo real cambia con cada compra, y una tabla de costos guardada
 * quedaría desactualizada en silencio. La foto histórica de lo que costó una venta concreta
 * ya la da el kardex (`existencias`), que sí guarda el costo del momento.
 */
export async function listarCosteo(): Promise<ResumenCosteo> {
  const [productos, recetas, costos, tasaIgv] = await Promise.all([
    productoRepository.find({
      where: { activo: true },
      relations: RELACIONES_PRODUCTO,
      order: { nombre: 'ASC' },
    }),
    recetasPorProducto(),
    obtenerCostosNetos(),
    resolverTasaIgv(),
  ]);

  const costeados = productos.map((producto) =>
    armarCosteo(producto, recetas.get(producto.id) ?? [], costos, tasaIgv),
  );

  const completos = costeados.filter((c) => c.costoCompleto && c.margen !== null);
  const valorVentaTotal = completos.reduce((suma, c) => suma + c.valorVenta, 0);
  const margenTotal = completos.reduce((suma, c) => suma + c.margen!, 0);

  return {
    tasaIgv,
    sinCostear: costeados.filter((c) => c.costo === null).length,
    margenPromedioPorcentaje:
      valorVentaTotal > 0 ? redondear((margenTotal / valorVentaTotal) * 100) : null,
    productos: costeados,
  };
}

export async function obtenerCosteoDeProducto(productoId: string): Promise<CosteoProducto> {
  const producto = await productoRepository.findOne({
    where: { id: productoId },
    relations: RELACIONES_PRODUCTO,
  });
  if (!producto) {
    throw new HttpError(404, 'Producto no encontrado');
  }

  const [lineasReceta, costos, tasaIgv] = await Promise.all([
    recetaInsumoRepository.find({
      where: { producto: { id: productoId } },
      relations: { insumo: { unidadMedida: true } },
      order: { insumo: { nombre: 'ASC' } },
    }),
    obtenerCostosNetos(),
    resolverTasaIgv(),
  ]);

  return armarCosteo(producto, lineasReceta, costos, tasaIgv);
}
