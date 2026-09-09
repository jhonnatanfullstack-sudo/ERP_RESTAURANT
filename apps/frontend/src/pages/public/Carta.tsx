import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search, UtensilsCrossed, X } from 'lucide-react';
import * as productosService from '../../services/productos.service';
import * as empresaService from '../../services/empresa.service';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProductoCarta } from '../../components/public/ProductoCarta';
import { BandejaPedidoFlotante } from '../../components/public/BandejaPedidoFlotante';
import { useBandejaPedido } from '../../hooks/useBandejaPedido';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import type { Producto } from '../../types/api';

// Referencia estable: `productosQuery.data ?? []` crearía un arreglo nuevo en cada render
// mientras carga, invalidando innecesariamente los useMemo que dependen de `productos`.
const SIN_PRODUCTOS: Producto[] = [];

/** Grilla de tarjetas fantasma mientras carga la carta — más agradable que un spinner suelto
 * en una página pensada para clientes, no para el staff. */
function CuadriculaCargando() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, indice) => (
        <div
          key={indice}
          className="animate-pulse overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
        >
          <div className="aspect-4/3 bg-zinc-100" />
          <div className="space-y-2.5 p-4">
            <div className="h-4 w-2/3 rounded bg-zinc-100" />
            <div className="h-3 w-full rounded bg-zinc-100" />
            <div className="mt-3 h-9 w-full rounded-xl bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Carta() {
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todas');
  const [busqueda, setBusqueda] = useState('');
  const bandeja = useBandejaPedido();

  const productosQuery = useQuery({
    queryKey: ['productos-publico'],
    queryFn: productosService.listarProductosPublico,
  });
  const empresaQuery = useQuery({
    queryKey: ['empresa-publica'],
    queryFn: empresaService.obtenerEmpresaPublica,
  });
  const empresa = empresaQuery.data;
  const nombreRestaurante = empresa?.nombre ?? 'nuestro restaurante';

  const productos = productosQuery.data ?? SIN_PRODUCTOS;

  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const producto of productos) {
      vistas.set(producto.categoria.id, producto.categoria.nombre);
    }
    return Array.from(vistas, ([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      const coincideCategoria =
        categoriaActiva === 'todas' || producto.categoria.id === categoriaActiva;
      if (!coincideCategoria) return false;
      if (!termino) return true;
      return (
        producto.nombre.toLowerCase().includes(termino) ||
        (producto.descripcion?.toLowerCase().includes(termino) ?? false)
      );
    });
  }, [productos, categoriaActiva, busqueda]);

  const enlaceWspGeneral = empresa?.telefono
    ? enlaceWhatsApp(
        empresa.telefono,
        `¡Hola ${nombreRestaurante}! Quisiera hacer una consulta sobre la carta.`,
      )
    : null;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-500 py-16 text-white sm:py-24">
        <div
          aria-hidden="true"
          className="animar-flotar pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="animar-flotar pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-black/10 blur-3xl"
          style={{ animationDelay: '1.5s' }}
        />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <span className="animate-fade-in inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase backdrop-blur">
            🍽️ Carta digital
          </span>
          <h1 className="animate-fade-in mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Nuestra Carta
          </h1>
          <p className="animate-fade-in mx-auto mt-3 max-w-xl text-sm text-orange-50 sm:text-base">
            Descubre nuestros platillos, arma tu pedido y envíanoslo directo por WhatsApp —
            preparados con los mejores ingredientes.
          </p>

          {enlaceWspGeneral && (
            <a
              href={enlaceWspGeneral}
              target="_blank"
              rel="noreferrer"
              className="animate-scale-in mt-7 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-orange-700 shadow-lg shadow-black/10 transition-transform hover:scale-105 active:scale-95"
            >
              <MessageCircle className="h-4.5 w-4.5" strokeWidth={2.25} />
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
      </section>

      {/* Buscador + categorías */}
      {productos.length > 0 && (
        <div className="sticky top-[65px] z-20 border-b border-zinc-200 bg-zinc-50/90 backdrop-blur-md">
          <div className="mx-auto max-w-6xl px-6 py-4">
            <div className="relative mx-auto max-w-sm sm:mx-0">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar en la carta…"
                className="w-full rounded-full border border-zinc-200 bg-white py-2.5 pr-9 pl-10 text-sm shadow-sm transition-colors focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-3.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setCategoriaActiva('todas')}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  categoriaActiva === 'todas'
                    ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25'
                    : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100'
                }`}
              >
                Todas
              </button>
              {categorias.map((categoria) => (
                <button
                  key={categoria.id}
                  type="button"
                  onClick={() => setCategoriaActiva(categoria.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    categoriaActiva === categoria.id
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25'
                      : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {categoria.nombre}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-6 py-10">
        {productosQuery.isLoading ? (
          <CuadriculaCargando />
        ) : productos.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 shadow-sm">
            <EmptyState
              icono={UtensilsCrossed}
              titulo="Estamos preparando nuestra carta digital"
              descripcion="Muy pronto podrás ver todos nuestros productos y precios aquí."
            />
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-6 py-16 shadow-sm">
            <EmptyState
              icono={Search}
              titulo="No encontramos productos con ese criterio"
              descripcion="Prueba con otra palabra o elige otra categoría."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productosFiltrados.map((producto, indice) => {
              const enBandeja = bandeja.items.find((item) => item.productoId === producto.id);
              return (
                <ProductoCarta
                  key={producto.id}
                  producto={producto}
                  cantidadEnBandeja={enBandeja?.cantidad ?? 0}
                  onAgregar={() => bandeja.agregar(producto.id)}
                  onQuitarUna={() =>
                    bandeja.cambiarCantidad(producto.id, (enBandeja?.cantidad ?? 1) - 1)
                  }
                  retraso={Math.min(indice, 8) * 45}
                />
              );
            })}
          </div>
        )}
      </div>

      <BandejaPedidoFlotante
        items={bandeja.items}
        productos={productos}
        onCambiarCantidad={bandeja.cambiarCantidad}
        onQuitar={bandeja.quitar}
        onVaciar={bandeja.vaciar}
        nombreRestaurante={nombreRestaurante}
        telefonoWhatsApp={empresa?.telefono ?? null}
      />
    </div>
  );
}
