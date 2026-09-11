import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, Coins, Download, Percent, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import * as costeoService from '../services/costeo.service';
import * as configuracionService from '../services/configuracion.service';
import { KpiCard } from '../components/ui/KpiCard';
import { Table } from '../components/ui/Table';
import { Modal } from '../components/ui/Modal';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { formatearCantidad, formatearNumero, formatearPrecio } from '../utils/formato';
import { mensajeError } from '../utils/errores';
import { exportarCsv } from '../utils/exportar';
import type { CosteoProducto } from '../types/api';

/**
 * Umbrales de "food cost" (costo de los insumos sobre el valor de venta) con los que se
 * evalúa un plato. Los define cada restaurante en Configuración (FASE 21); estos son los
 * valores de respaldo mientras la consulta carga, y coinciden con las referencias habituales
 * del rubro: hasta ~35% es sano, por encima de 50% el plato casi no deja margen.
 */
const FOOD_COST_SANO_POR_DEFECTO = 35;
const FOOD_COST_ALERTA_POR_DEFECTO = 50;

type Orden = 'margen-asc' | 'margen-desc' | 'nombre';

const ORDENES: Array<{ valor: Orden; etiqueta: string }> = [
  { valor: 'margen-asc', etiqueta: 'Menor margen primero' },
  { valor: 'margen-desc', etiqueta: 'Mayor margen primero' },
  { valor: 'nombre', etiqueta: 'Nombre' },
];

function formatearPorcentaje(valor: number | null): string {
  return valor === null ? '—' : `${valor.toFixed(1)}%`;
}

interface Umbrales {
  objetivo: number;
  critico: number;
}

function tonoFoodCost(porcentaje: number, umbrales: Umbrales): string {
  if (porcentaje <= umbrales.objetivo) return 'bg-emerald-500';
  if (porcentaje <= umbrales.critico) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Barra del food cost: el número solo no dice si está bien; la barra con color lo ubica
 * contra el rango sano de un vistazo, que es cómo se revisa una carta entera. */
function BarraFoodCost({
  porcentaje,
  umbrales,
}: {
  porcentaje: number | null;
  umbrales: Umbrales;
}) {
  if (porcentaje === null) return <span className="text-sm text-zinc-400">—</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${tonoFoodCost(porcentaje, umbrales)}`}
          style={{ width: `${Math.min(porcentaje, 100)}%` }}
        />
      </div>
      <span className="text-sm tabular-nums text-zinc-700">{formatearPorcentaje(porcentaje)}</span>
    </div>
  );
}

function EtiquetaPendiente({ producto }: { producto: CosteoProducto }) {
  if (producto.motivoSinCosteo === 'sin_receta') {
    return <Badge tono="peligro">Sin receta</Badge>;
  }
  if (producto.motivoSinCosteo === 'sin_costos') {
    return <Badge tono="peligro">Sin costo de compra</Badge>;
  }
  if (!producto.costoCompleto) {
    return <Badge tono="neutral">Costeo parcial</Badge>;
  }
  return null;
}

/** Desglose de un platillo: de dónde sale cada sol de su costo. */
function DetalleCosteo({ producto }: { producto: CosteoProducto }) {
  return (
    <div className="flex flex-col gap-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { etiqueta: 'Precio de carta', valor: formatearPrecio(producto.precio) },
          { etiqueta: 'Valor de venta', valor: formatearPrecio(producto.valorVenta) },
          {
            etiqueta: 'Costo unitario',
            valor: producto.costo === null ? '—' : formatearPrecio(producto.costo),
          },
          {
            etiqueta: 'Margen',
            valor: producto.margen === null ? '—' : formatearPrecio(producto.margen),
          },
        ].map((dato) => (
          <div key={dato.etiqueta} className="rounded-lg border border-zinc-200 px-3 py-2.5">
            <dt className="text-xs text-zinc-500">{dato.etiqueta}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
              {dato.valor}
            </dd>
          </div>
        ))}
      </dl>

      {producto.origenCosto === 'manual' && (
        <Alert
          tipo="advertencia"
          mensaje="El costo sale de un movimiento de inventario registrado a mano, sin el desglose de IGV de un comprobante. Registra la compra desde Compras para que el costo sea exacto."
        />
      )}

      {producto.componentesSinCosto.length > 0 && (
        <Alert
          tipo="advertencia"
          mensaje={`Sin costo de compra registrado: ${producto.componentesSinCosto.join(', ')}. El margen que se muestra está sobreestimado.`}
        />
      )}

      {producto.lineas.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-zinc-200">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs font-medium text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Insumo</th>
                <th className="px-4 py-2.5">Cantidad</th>
                <th className="px-4 py-2.5">Costo unitario</th>
                <th className="px-4 py-2.5 text-right">Costo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {producto.lineas.map((linea) => (
                <tr key={linea.insumoId}>
                  <td className="px-4 py-2.5 text-zinc-900">{linea.nombre}</td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600">
                    {formatearCantidad(linea.cantidad)} {linea.unidadMedida}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums text-zinc-600">
                    {linea.costoUnitario === null ? '—' : formatearPrecio(linea.costoUnitario)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900">
                    {linea.costoLinea === null ? '—' : formatearPrecio(linea.costoLinea)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          {producto.tipo === 'mercaderia'
            ? 'Es una mercadería: su costo es el de su última compra, no depende de una receta.'
            : 'Este platillo todavía no tiene receta. Cárgala desde Productos para poder costearlo.'}
        </p>
      )}
    </div>
  );
}

export function Costos() {
  const [busqueda, setBusqueda] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [orden, setOrden] = useState<Orden>('margen-asc');
  const [detalle, setDetalle] = useState<CosteoProducto | null>(null);

  const costeoQuery = useQuery({ queryKey: ['costeo'], queryFn: costeoService.obtenerCosteo });
  // Los umbrales del semáforo los define cada restaurante en Configuración (FASE 21).
  const configuracionQuery = useQuery({
    queryKey: ['configuracion'],
    queryFn: configuracionService.obtenerConfiguracion,
    staleTime: 10 * 60 * 1000,
  });
  const umbrales: Umbrales = {
    objetivo: configuracionQuery.data?.foodCostObjetivo ?? FOOD_COST_SANO_POR_DEFECTO,
    critico: configuracionQuery.data?.foodCostCritico ?? FOOD_COST_ALERTA_POR_DEFECTO,
  };
  const productos = useMemo(() => costeoQuery.data?.productos ?? [], [costeoQuery.data]);

  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    productos.forEach((p) => vistas.set(p.categoria.id, p.categoria.nombre));
    return Array.from(vistas, ([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    const lista = productos.filter(
      (p) =>
        (!termino || p.nombre.toLowerCase().includes(termino)) &&
        (!categoriaId || p.categoria.id === categoriaId),
    );
    return [...lista].sort((a, b) => {
      if (orden === 'nombre') return a.nombre.localeCompare(b.nombre);
      // Los productos sin costear no tienen margen que comparar: van siempre al final en vez
      // de mezclarse como si tuvieran margen 0 (que los pondría arriba en "menor margen").
      if (a.margenPorcentaje === null || b.margenPorcentaje === null) {
        return (a.margenPorcentaje === null ? 1 : 0) - (b.margenPorcentaje === null ? 1 : 0);
      }
      return orden === 'margen-asc'
        ? a.margenPorcentaje - b.margenPorcentaje
        : b.margenPorcentaje - a.margenPorcentaje;
    });
  }, [productos, busqueda, categoriaId, orden]);

  const costeados = productos.filter((p) => p.costo !== null);
  const conFoodCost = costeados.filter((p) => p.costoPorcentaje !== null);
  const foodCostPromedio =
    conFoodCost.length > 0
      ? conFoodCost.reduce((s, p) => s + p.costoPorcentaje!, 0) / conFoodCost.length
      : 0;
  const enAlerta = conFoodCost.filter((p) => p.costoPorcentaje! > umbrales.critico).length;

  function exportar() {
    exportarCsv(
      'costos-y-margenes',
      [
        { encabezado: 'Producto', valor: (p: CosteoProducto) => p.nombre },
        { encabezado: 'Categoría', valor: (p: CosteoProducto) => p.categoria.nombre },
        { encabezado: 'Tipo', valor: (p: CosteoProducto) => p.tipo },
        { encabezado: 'Precio de carta', valor: (p: CosteoProducto) => p.precio },
        { encabezado: 'Valor de venta', valor: (p: CosteoProducto) => p.valorVenta },
        { encabezado: 'Costo', valor: (p: CosteoProducto) => p.costo },
        { encabezado: 'Margen', valor: (p: CosteoProducto) => p.margen },
        { encabezado: 'Margen %', valor: (p: CosteoProducto) => p.margenPorcentaje },
        { encabezado: 'Food cost %', valor: (p: CosteoProducto) => p.costoPorcentaje },
        {
          encabezado: 'Pendiente',
          valor: (p: CosteoProducto) =>
            p.motivoSinCosteo === 'sin_receta'
              ? 'Sin receta'
              : p.motivoSinCosteo === 'sin_costos'
                ? 'Sin costo de compra'
                : p.costoCompleto
                  ? ''
                  : 'Costeo parcial',
        },
      ],
      filtrados,
    );
  }

  const tasaIgv = costeoQuery.data?.tasaIgv;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Costos y márgenes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Cuánto cuesta preparar cada producto y cuánto deja al venderlo
            {tasaIgv !== undefined && `, con el IGV del ${(tasaIgv * 100).toFixed(1)}% descontado`}.
          </p>
        </div>
        <Button
          variante="secondary"
          icono={<Download className="h-4 w-4" />}
          onClick={exportar}
          disabled={filtrados.length === 0}
        >
          Exportar CSV
        </Button>
      </header>

      {costeoQuery.data && costeoQuery.data.sinCostear > 0 && (
        <Alert
          tipo="advertencia"
          mensaje={`${costeoQuery.data.sinCostear} producto(s) todavía no se pueden costear: les falta la receta, o ninguno de sus insumos tiene una compra con costo registrado.`}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          etiqueta="Margen promedio"
          valor={costeoQuery.data?.margenPromedioPorcentaje ?? 0}
          formatear={(v) => `${v.toFixed(1)}%`}
          icono={Percent}
          tono="esmeralda"
          detalle="Ponderado por valor de venta"
          cargando={costeoQuery.isLoading}
        />
        <KpiCard
          etiqueta="Food cost promedio"
          valor={foodCostPromedio}
          formatear={(v) => `${v.toFixed(1)}%`}
          icono={Coins}
          tono="ambar"
          detalle={`Rango sano definido: hasta ${umbrales.objetivo}%`}
          invertirDelta
          cargando={costeoQuery.isLoading}
        />
        <KpiCard
          etiqueta="Productos costeados"
          valor={costeados.length}
          formatear={formatearNumero}
          icono={Calculator}
          tono="azul"
          detalle={`de ${productos.length} activos`}
          cargando={costeoQuery.isLoading}
        />
        <KpiCard
          etiqueta="Margen crítico"
          valor={enAlerta}
          formatear={formatearNumero}
          icono={TriangleAlert}
          tono="violeta"
          detalle={`Food cost sobre ${umbrales.critico}%`}
          cargando={costeoQuery.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <Input
          label="Buscar"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Nombre del producto"
        />
        <Select
          label="Categoría"
          value={categoriaId}
          onChange={(evento) => setCategoriaId(evento.target.value)}
        >
          <option value="">Todas</option>
          {categorias.map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nombre}
            </option>
          ))}
        </Select>
        <Select
          label="Ordenar por"
          value={orden}
          onChange={(evento) => setOrden(evento.target.value as Orden)}
        >
          {ORDENES.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </Select>
      </div>

      <Table
        columnas={[
          {
            encabezado: 'Producto',
            render: (p: CosteoProducto) => (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDetalle(p)}
                  className="font-medium text-zinc-900 transition-colors hover:text-orange-600"
                >
                  {p.nombre}
                </button>
                <EtiquetaPendiente producto={p} />
              </div>
            ),
          },
          { encabezado: 'Categoría', render: (p: CosteoProducto) => p.categoria.nombre },
          {
            encabezado: 'Precio',
            render: (p: CosteoProducto) => (
              <span className="tabular-nums">{formatearPrecio(p.precio)}</span>
            ),
          },
          {
            encabezado: 'Valor de venta',
            render: (p: CosteoProducto) => (
              <span className="tabular-nums text-zinc-500">{formatearPrecio(p.valorVenta)}</span>
            ),
          },
          {
            encabezado: 'Costo',
            render: (p: CosteoProducto) => (
              <span className="tabular-nums">
                {p.costo === null ? '—' : formatearPrecio(p.costo)}
              </span>
            ),
          },
          {
            encabezado: 'Margen',
            render: (p: CosteoProducto) =>
              p.margen === null ? (
                <span className="text-zinc-400">—</span>
              ) : (
                <span className="tabular-nums">
                  <span className="font-medium text-zinc-900">{formatearPrecio(p.margen)}</span>
                  <span className="ml-1.5 text-xs text-zinc-500">
                    {formatearPorcentaje(p.margenPorcentaje)}
                  </span>
                </span>
              ),
          },
          {
            encabezado: 'Food cost',
            render: (p: CosteoProducto) => (
              <BarraFoodCost porcentaje={p.costoPorcentaje} umbrales={umbrales} />
            ),
          },
        ]}
        filas={filtrados}
        claveFila={(p) => p.productoId}
        cargando={costeoQuery.isLoading}
        error={
          costeoQuery.isError
            ? mensajeError(costeoQuery.error, 'No se pudo cargar el costeo')
            : undefined
        }
        onReintentar={() => void costeoQuery.refetch()}
        vacio="Sin productos que costear"
        vacioDescripcion="Registra productos en la carta para ver aquí su costo y su margen."
      />

      <Modal
        abierto={detalle !== null}
        titulo={detalle?.nombre ?? ''}
        descripcion="Desglose del costo de una unidad"
        onCerrar={() => setDetalle(null)}
        tamano="xl"
      >
        {detalle && <DetalleCosteo producto={detalle} />}
      </Modal>

      {productos.length === 0 && !costeoQuery.isLoading && !costeoQuery.isError && (
        <p className="flex items-center justify-center gap-2 text-sm text-zinc-400">
          <UtensilsCrossed className="h-4 w-4" />
          La carta todavía no tiene productos activos.
        </p>
      )}
    </div>
  );
}
