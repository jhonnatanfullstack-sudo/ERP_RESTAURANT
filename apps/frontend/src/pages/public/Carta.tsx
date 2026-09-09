import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, MessageCircle, Search, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import * as productosService from '../../services/productos.service';
import * as empresaService from '../../services/empresa.service';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProductoCarta } from '../../components/public/ProductoCarta';
import { SeccionCategoriaCarta } from '../../components/public/SeccionCategoriaCarta';
import { BandejaPedidoFlotante } from '../../components/public/BandejaPedidoFlotante';
import { BotonSubir } from '../../components/public/BotonSubir';
import { CarruselPlatillos } from '../../components/public/CarruselPlatillos';
import { CintaAnimada } from '../../components/public/CintaAnimada';
import { useBandejaPedido } from '../../hooks/useBandejaPedido';
import { useEnVista } from '../../hooks/useEnVista';
import { useDesplazamientoParalaje } from '../../hooks/useDesplazamientoParalaje';
import { useMovimientoReducido } from '../../hooks/animacion';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import { urlImagen } from '../../utils/formato';
import type { Producto } from '../../types/api';

/** Máximo de platillos que muestra el carrusel — es una vitrina, no un listado completo. */
const MAXIMO_EN_CARRUSEL = 10;
/** Cuántas fotos rellenan el mosaico del hero — se repiten si hay menos platillos que esto. */
const CANTIDAD_MOSAICO = 18;
/** Compensa la barra pegajosa (header + buscador + categorías) al saltar a una sección. */
const DESPLAZAMIENTO_SALTO_MS = 60;

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
  const [busqueda, setBusqueda] = useState('');
  const bandeja = useBandejaPedido();
  const movimientoReducido = useMovimientoReducido();
  const paralaje = useDesplazamientoParalaje();

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
  const buscando = busqueda.trim().length > 0;

  const categorias = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const producto of productos) {
      vistas.set(producto.categoria.id, producto.categoria.nombre);
    }
    return Array.from(vistas, ([id, nombre]) => ({ id, nombre }));
  }, [productos]);

  const productosPorCategoria = useMemo(
    () =>
      categorias.map((categoria) => ({
        categoria,
        productos: productos.filter((p) => p.categoria.id === categoria.id),
      })),
    [categorias, productos],
  );

  const resultadosBusqueda = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return SIN_PRODUCTOS;
    return productos.filter(
      (producto) =>
        producto.nombre.toLowerCase().includes(termino) ||
        (producto.descripcion?.toLowerCase().includes(termino) ?? false),
    );
  }, [productos, busqueda]);

  // --- Scrollspy: qué categoría resaltar en la barra según lo que esté a la vista, y qué
  // secciones ya se revelaron alguna vez (para su animación de entrada). Un solo observer
  // sirve para ambas cosas. Como las secciones recién se montan cuando `productos` termina
  // de cargar, el efecto depende de `categorias` (que cambia justo en ese momento) — no de
  // un `useRef` vacío que nunca dispararía un nuevo `useEffect` por sí solo.
  const seccionesRef = useRef(new Map<string, HTMLElement>());
  const inicioGridRef = useRef<HTMLDivElement>(null);
  const [interseccion, setInterseccion] = useState<Record<string, boolean>>({});
  const [reveladas, setReveladas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (buscando || categorias.length === 0) return;
    const observer = new IntersectionObserver(
      (entradas) => {
        setInterseccion((previo) => {
          const nuevo = { ...previo };
          entradas.forEach((entrada) => {
            const id = (entrada.target as HTMLElement).dataset.categoriaId;
            if (id) nuevo[id] = entrada.isIntersecting;
          });
          return nuevo;
        });
        setReveladas((previo) => {
          let cambio = false;
          const nuevo = new Set(previo);
          entradas.forEach((entrada) => {
            if (!entrada.isIntersecting) return;
            const id = (entrada.target as HTMLElement).dataset.categoriaId;
            if (id && !nuevo.has(id)) {
              nuevo.add(id);
              cambio = true;
            }
          });
          return cambio ? nuevo : previo;
        });
      },
      { rootMargin: '-170px 0px -65% 0px', threshold: 0 },
    );

    seccionesRef.current.forEach((elemento) => observer.observe(elemento));
    return () => observer.disconnect();
  }, [buscando, categorias]);

  const categoriaEnVista = categorias.find((c) => interseccion[c.id])?.id ?? categorias[0]?.id;

  function registrarSeccion(id: string) {
    return (elemento: HTMLElement | null) => {
      if (elemento) seccionesRef.current.set(id, elemento);
      else seccionesRef.current.delete(id);
    };
  }

  function irACategoria(id: string | null) {
    if (busqueda) setBusqueda('');
    // Si había una búsqueda activa, las secciones recién vuelven a montarse — se espera un
    // instante a que el DOM las tenga antes de medir dónde saltar.
    window.setTimeout(() => {
      const objetivo = id ? seccionesRef.current.get(id) : inicioGridRef.current;
      objetivo?.scrollIntoView({
        behavior: movimientoReducido ? 'auto' : 'smooth',
        block: 'start',
      });
    }, DESPLAZAMIENTO_SALTO_MS);
  }

  const enlaceWspGeneral = empresa?.telefono
    ? enlaceWhatsApp(
        empresa.telefono,
        `¡Hola ${nombreRestaurante}! Quisiera hacer una consulta sobre la carta.`,
      )
    : null;

  const carrusel = productos.slice(0, MAXIMO_EN_CARRUSEL);
  const { ref: refCarrusel, visible: carruselVisible } = useEnVista<HTMLDivElement>();

  // Fotos reales de los platillos como fondo del hero — "imágenes de restaurante" genuinas,
  // no stock. Se repiten si hay pocas: bajo el degradado semitransparente + backdrop-blur
  // leen como una textura cálida, no como una foto repetida de forma obvia.
  const fotosMosaico = useMemo(() => {
    const urls = productos.map((p) => urlImagen(p.imagenUrl)).filter((url): url is string => !!url);
    if (urls.length === 0) return [];
    return Array.from({ length: CANTIDAD_MOSAICO }, (_, i) => urls[i % urls.length]);
  }, [productos]);

  return (
    <div>
      {/* Hero + vitrina de platillos */}
      <section className="relative overflow-hidden pt-16 pb-20 text-white sm:pt-24 sm:pb-28">
        {fotosMosaico.length > 0 && (
          <div
            aria-hidden="true"
            className="animar-mosaico absolute -inset-x-4 -top-[15%] -bottom-[15%]"
            style={{ transform: `translateY(${-paralaje}px)` }}
          >
            <div className="grid h-full grid-cols-3 gap-1 sm:grid-cols-6">
              {fotosMosaico.map((url, indice) => (
                <div key={indice} className="relative overflow-hidden">
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-br from-orange-700/95 via-orange-600/90 to-amber-500/90 backdrop-blur-[3px]"
        />

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
          <div className="relative inline-block">
            {/* Vapor: el mismo guiño visual de "recién servido" que un plato humeante. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-3 left-1/2 flex -translate-x-1/2 gap-2.5"
            >
              <span className="animar-vapor h-6 w-1 rounded-full bg-white/50 blur-[2px]" />
              <span
                className="animar-vapor h-8 w-1 rounded-full bg-white/50 blur-[2px]"
                style={{ animationDelay: '0.7s' }}
              />
              <span
                className="animar-vapor h-6 w-1 rounded-full bg-white/50 blur-[2px]"
                style={{ animationDelay: '1.4s' }}
              />
            </div>
            <span className="animate-fade-in inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold tracking-wide uppercase backdrop-blur">
              🍽️ Carta digital
            </span>
          </div>
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

        {carrusel.length >= 2 && (
          <div
            ref={refCarrusel}
            className={`relative mt-14 transition-all duration-700 sm:mt-16 ${
              carruselVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            <p className="flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide text-orange-100 uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              Desliza para ver más
            </p>
            <div className="mt-4">
              <CarruselPlatillos
                productos={carrusel}
                items={bandeja.items}
                onAgregar={(productoId) => bandeja.agregar(productoId)}
              />
            </div>
          </div>
        )}

        {/* Divisor de onda: cierra la zona de color hacia el fondo claro del resto de la página. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          className="absolute -bottom-px left-0 h-12 w-full text-zinc-50 sm:h-20"
        >
          <path
            fill="currentColor"
            d="M0,40 C240,90 480,0 720,40 C960,80 1200,10 1440,40 L1440,100 L0,100 Z"
          />
        </svg>
      </section>

      <CintaAnimada />

      {/* Buscador + categorías: saltan a la sección correspondiente en vez de filtrar la
          página (más parecido a cómo se navega un menú digital de restaurante). */}
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

            {categorias.length > 1 && (
              <div className="mt-3.5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => irACategoria(null)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    !buscando && !categoriaEnVista
                      ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25'
                      : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Todas
                </button>
                {categorias.map((categoria) => {
                  const foto = urlImagen(
                    productos.find((p) => p.categoria.id === categoria.id)?.imagenUrl ?? null,
                  );
                  const activa = !buscando && categoriaEnVista === categoria.id;
                  return (
                    <button
                      key={categoria.id}
                      type="button"
                      onClick={() => irACategoria(categoria.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pr-4 pl-1.5 text-sm font-medium transition-all ${
                        activa
                          ? 'bg-orange-600 text-white shadow-sm shadow-orange-600/25'
                          : 'bg-white text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                          activa ? 'ring-2 ring-white/60' : 'bg-zinc-100'
                        }`}
                      >
                        {foto ? (
                          <img src={foto} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <UtensilsCrossed
                            className={`h-3 w-3 ${activa ? 'text-white' : 'text-zinc-400'}`}
                          />
                        )}
                      </span>
                      {categoria.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="relative mx-auto max-w-6xl overflow-hidden px-6 py-10">
        <UtensilsCrossed
          aria-hidden="true"
          strokeWidth={0.6}
          className="pointer-events-none absolute -top-10 -right-16 h-64 w-64 text-zinc-900/[0.03]"
        />

        {productosQuery.isLoading ? (
          <CuadriculaCargando />
        ) : productos.length === 0 ? (
          <div className="relative rounded-2xl border border-zinc-200 bg-white px-6 py-16 shadow-sm">
            <EmptyState
              icono={UtensilsCrossed}
              titulo="Estamos preparando nuestra carta digital"
              descripcion="Muy pronto podrás ver todos nuestros productos y precios aquí."
            />
          </div>
        ) : buscando ? (
          resultadosBusqueda.length === 0 ? (
            <div className="relative rounded-2xl border border-zinc-200 bg-white px-6 py-16 shadow-sm">
              <EmptyState
                icono={Search}
                titulo="No encontramos productos con ese criterio"
                descripcion="Prueba con otra palabra o revisa las categorías de abajo."
              />
            </div>
          ) : (
            <div className="relative grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {resultadosBusqueda.map((producto, indice) => {
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
          )
        ) : (
          <div ref={inicioGridRef} className="relative flex flex-col gap-14 scroll-mt-[170px]">
            {productosPorCategoria.map(({ categoria, productos: productosCategoria }) => (
              <SeccionCategoriaCarta
                key={categoria.id}
                categoria={categoria}
                productos={productosCategoria}
                items={bandeja.items}
                onAgregar={(id) => bandeja.agregar(id)}
                onQuitarUna={(id, cantidadActual) =>
                  bandeja.cambiarCantidad(id, cantidadActual - 1)
                }
                revelada={reveladas.has(categoria.id)}
                registrarSeccion={registrarSeccion(categoria.id)}
              />
            ))}
          </div>
        )}
      </div>

      <BotonSubir />

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
