import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UtensilsCrossed } from 'lucide-react';
import * as productosService from '../../services/productos.service';
import { Spinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatearPrecio, urlImagen } from '../../utils/formato';

export function Carta() {
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todas');

  const productosQuery = useQuery({
    queryKey: ['productos-publico'],
    queryFn: productosService.listarProductosPublico,
  });

  const categorias = useMemo(() => {
    const productos = productosQuery.data ?? [];
    const vistas = new Map<string, string>();
    for (const producto of productos) {
      vistas.set(producto.categoria.id, producto.categoria.nombre);
    }
    return Array.from(vistas, ([id, nombre]) => ({ id, nombre }));
  }, [productosQuery.data]);

  const productos = productosQuery.data ?? [];
  const productosFiltrados =
    categoriaActiva === 'todas'
      ? productos
      : productos.filter((p) => p.categoria.id === categoriaActiva);

  if (productosQuery.isLoading) return <Spinner />;

  return (
    <div>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Nuestra Carta</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Descubre nuestros platillos, preparados con los mejores ingredientes.
        </p>
      </div>

      {productos.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-zinc-200 bg-white px-6 py-16 shadow-sm">
          <EmptyState
            icono={UtensilsCrossed}
            titulo="Estamos preparando nuestra carta digital"
            descripcion="Muy pronto podrás ver todos nuestros productos y precios aquí."
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setCategoriaActiva('todas')}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                categoriaActiva === 'todas'
                  ? 'bg-orange-600 text-white'
                  : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50'
              }`}
            >
              Todas
            </button>
            {categorias.map((categoria) => (
              <button
                key={categoria.id}
                type="button"
                onClick={() => setCategoriaActiva(categoria.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  categoriaActiva === categoria.id
                    ? 'bg-orange-600 text-white'
                    : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50'
                }`}
              >
                {categoria.nombre}
              </button>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {productosFiltrados.map((producto) => {
              const imagen = urlImagen(producto.imagenUrl);
              return (
                <div
                  key={producto.id}
                  className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
                    {imagen ? (
                      <img
                        src={imagen}
                        alt={producto.nombre}
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-300">
                        <UtensilsCrossed className="h-10 w-10" strokeWidth={1.25} />
                      </div>
                    )}
                    <span className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-600 backdrop-blur">
                      {producto.categoria.nombre}
                    </span>
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-zinc-900">{producto.nombre}</h3>
                      <span className="shrink-0 text-lg font-bold text-orange-600">
                        {formatearPrecio(producto.precio)}
                      </span>
                    </div>
                    {producto.descripcion && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-zinc-500">
                        {producto.descripcion}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
