import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, MessageCircle, Search, UtensilsCrossed, X } from 'lucide-react';
import * as productosService from '../../services/productos.service';
import * as empresaService from '../../services/empresa.service';
import { EmptyState } from '../../components/ui/EmptyState';
import { MenuInteractivo } from '../../components/public/MenuInteractivo';
import { BandejaPedidoFlotante } from '../../components/public/BandejaPedidoFlotante';
import { BotonSubir } from '../../components/public/BotonSubir';
import { ModalPlatillo } from '../../components/public/ModalPlatillo';
import { BarraProgresoLectura } from '../../components/public/BarraProgresoLectura';
import { PalabraRotativa } from '../../components/public/PalabraRotativa';
import { ComoPedir } from '../../components/public/ComoPedir';
import { MapaUbicacion } from '../../components/public/MapaUbicacion';
import { useBandejaPedido } from '../../hooks/useBandejaPedido';
import { useMovimientoReducido } from '../../hooks/animacion';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import { urlImagen } from '../../utils/formato';
import type { GrupoCategoria } from '../../components/public/MenuInteractivo';
import type { Producto } from '../../types/api';

/** Compensa la barra pegajosa (cabecera + buscador) al saltar a una categoría. */
const DESPLAZAMIENTO_SALTO_MS = 60;

// Referencia estable: `productosQuery.data ?? []` crearía un arreglo nuevo en cada render
// mientras carga, invalidando innecesariamente los useMemo que dependen de `productos`.
const SIN_PRODUCTOS: Producto[] = [];

/** Esqueleto de la lista mientras carga: repite la forma real (nombre, filete, precio) para
 * que la página no salte cuando llegan los datos. */
function ListaCargando() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-32 rounded bg-(--carta-elevado)" />
      <div className="mt-8 flex flex-col gap-8">
        {Array.from({ length: 5 }).map((_, indice) => (
          <div key={indice} className="flex items-center gap-4">
            <div className="h-6 w-44 rounded bg-(--carta-elevado)" />
            <div className="h-px flex-1 bg-(--carta-elevado)" />
            <div className="h-6 w-16 rounded bg-(--carta-elevado)" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Carta() {
  const [busqueda, setBusqueda] = useState('');
  const [platilloAbierto, setPlatilloAbierto] = useState<Producto | null>(null);
  const bandeja = useBandejaPedido();
  const movimientoReducido = useMovimientoReducido();

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

  const grupos = useMemo<GrupoCategoria[]>(
    () =>
      categorias.map((categoria) => ({
        categoria,
        productos: productos.filter((p) => p.categoria.id === categoria.id),
      })),
    [categorias, productos],
  );

  // La búsqueda reusa la misma lista: un solo grupo con los resultados, para no mantener dos
  // presentaciones distintas del mismo contenido.
  const gruposBusqueda = useMemo<GrupoCategoria[]>(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return [];
    const encontrados = productos.filter(
      (producto) =>
        producto.nombre.toLowerCase().includes(termino) ||
        (producto.descripcion?.toLowerCase().includes(termino) ?? false),
    );
    return encontrados.length === 0
      ? []
      : [{ categoria: { id: 'busqueda', nombre: `Resultados (${encontrados.length})` }, productos: encontrados }];
  }, [productos, busqueda]);

  // --- Scrollspy: qué categoría resaltar en la barra según lo que esté a la vista.
  const seccionesRef = useRef(new Map<string, HTMLElement>());
  const inicioMenuRef = useRef<HTMLDivElement>(null);
  const [interseccion, setInterseccion] = useState<Record<string, boolean>>({});

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
      },
      { rootMargin: '-160px 0px -60% 0px', threshold: 0 },
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

  function irA(elemento: HTMLElement | null | undefined) {
    elemento?.scrollIntoView({
      behavior: movimientoReducido ? 'auto' : 'smooth',
      block: 'start',
    });
  }

  function irACategoria(id: string | null) {
    if (busqueda) setBusqueda('');
    // Si había búsqueda activa, las secciones recién vuelven a montarse: se espera un instante
    // a que el DOM las tenga antes de medir dónde saltar.
    window.setTimeout(() => {
      irA(id ? seccionesRef.current.get(id) : inicioMenuRef.current);
    }, DESPLAZAMIENTO_SALTO_MS);
  }

  const enlaceWspGeneral = empresa?.telefono
    ? enlaceWhatsApp(
        empresa.telefono,
        `Hola ${nombreRestaurante}, quisiera hacer una consulta sobre la carta.`,
      )
    : null;

  const fotoHero = useMemo(() => {
    const conFoto = productos.find((producto) => urlImagen(producto.imagenUrl) !== null);
    return conFoto ? { url: urlImagen(conFoto.imagenUrl)!, nombre: conFoto.nombre } : null;
  }, [productos]);

  const cantidadPlatilloAbierto = platilloAbierto
    ? (bandeja.items.find((item) => item.productoId === platilloAbierto.id)?.cantidad ?? 0)
    : 0;

  const gruposVisibles = buscando ? gruposBusqueda : grupos;

  return (
    <div>
      <BarraProgresoLectura />

      {/* Hero: el titular manda y la foto entra desde el borde de la pantalla, sin quedar
          encajada en una tarjeta centrada. */}
      <section className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-8">
          <div>
            <p
              className="animar-revelar text-xs font-semibold tracking-[0.2em] text-(--carta-acento) uppercase"
              style={{ animationDelay: '60ms' }}
            >
              Carta digital
            </p>
            <h1
              // Tope en 6xl: a 7xl "Pide por WhatsApp." no entra en esta columna y el titular
              // parte en tres líneas, cortando la frase por la mitad.
              className="animar-revelar mt-6 text-[2.6rem] leading-[1.02] font-semibold tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '150ms' }}
            >
              Elige tu{' '}
              <PalabraRotativa palabras={['almuerzo.', 'antojo.', 'cena.', 'menú.']} />
              <br />
              Pide por WhatsApp.
            </h1>
            <p
              className="animar-revelar mt-6 max-w-sm text-base leading-relaxed text-(--carta-suave)"
              style={{ animationDelay: '240ms' }}
            >
              Toda la carta con fotos y precios al día. Arma tu pedido y envíalo en un toque.
            </p>

            <div
              className="animar-revelar mt-9 flex flex-wrap items-center gap-3"
              style={{ animationDelay: '330ms' }}
            >
              <button
                type="button"
                onClick={() => irA(inicioMenuRef.current)}
                className="rounded-xl bg-(--carta-acento) px-7 py-4 text-sm font-semibold text-(--carta-acento-contraste) transition-transform hover:-translate-y-0.5 active:translate-y-0"
              >
                Ver la carta
              </button>
              {enlaceWspGeneral && (
                <a
                  href={enlaceWspGeneral}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-(--carta-borde) px-7 py-4 text-sm font-semibold transition-colors hover:bg-(--carta-elevado)"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                  Escríbenos
                </a>
              )}
            </div>
          </div>

          {fotoHero && (
            <div
              className="animar-revelar relative hidden lg:block"
              style={{ animationDelay: '420ms' }}
            >
              <div
                aria-hidden="true"
                className="animar-resplandor absolute -inset-6 rounded-full bg-(--carta-acento)/10 blur-3xl"
              />
              {/* `w-screen` more allá del contenedor: la foto sale por el borde derecho de la
                  pantalla en vez de quedar centrada como una tarjeta. */}
              <div className="relative overflow-hidden rounded-l-[3rem]">
                <img
                  src={fotoHero.url}
                  alt={fotoHero.nombre}
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Barra: buscador y salto entre categorías. */}
      {productos.length > 0 && (
        <div className="sticky top-16 z-20 border-y border-(--carta-borde) bg-(--carta-fondo)/90 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:px-8">
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-(--carta-suave)" />
              <input
                type="search"
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
                placeholder="Buscar un plato"
                aria-label="Buscar en la carta"
                className="w-full rounded-xl border border-(--carta-borde) bg-(--carta-superficie) py-2.5 pr-9 pl-10 text-sm transition-colors placeholder:text-(--carta-suave) focus:border-(--carta-acento) focus:outline-none"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-(--carta-suave) transition-colors hover:text-(--carta-texto)"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {categorias.length > 1 && (
              <div className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none sm:ml-auto [&::-webkit-scrollbar]:hidden">
                {categorias.map((categoria) => {
                  const activa = !buscando && categoriaEnVista === categoria.id;
                  return (
                    <button
                      key={categoria.id}
                      type="button"
                      onClick={() => irACategoria(categoria.id)}
                      className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                        activa
                          ? 'bg-(--carta-texto) text-(--carta-fondo)'
                          : 'text-(--carta-suave) hover:bg-(--carta-elevado) hover:text-(--carta-texto)'
                      }`}
                    >
                      {categoria.nombre}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={inicioMenuRef}
        className="mx-auto max-w-6xl scroll-mt-32 px-5 py-16 sm:px-8 sm:py-24"
      >
        {productosQuery.isError ? (
          <div className="py-10">
            <EmptyState
              icono={AlertTriangle}
              titulo="No pudimos cargar la carta"
              descripcion="Vuelve a intentarlo en un momento o escríbenos por WhatsApp."
            />
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => void productosQuery.refetch()}
                className="rounded-xl border border-(--carta-borde) px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-(--carta-elevado)"
              >
                Reintentar
              </button>
            </div>
          </div>
        ) : productosQuery.isLoading ? (
          <ListaCargando />
        ) : productos.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icono={UtensilsCrossed}
              titulo="Estamos preparando nuestra carta"
              descripcion="Muy pronto verás aquí todos nuestros platos y precios."
            />
          </div>
        ) : gruposVisibles.length === 0 ? (
          <div className="py-10">
            <EmptyState
              icono={Search}
              titulo={`Sin resultados para "${busqueda.trim()}"`}
              descripcion="Prueba con otra palabra o elige una categoría de arriba."
            />
          </div>
        ) : (
          <MenuInteractivo
            grupos={gruposVisibles}
            items={bandeja.items}
            onAgregar={(id) => bandeja.agregar(id)}
            onQuitarUna={(id, cantidadActual) => bandeja.cambiarCantidad(id, cantidadActual - 1)}
            onVerDetalle={setPlatilloAbierto}
            registrarSeccion={registrarSeccion}
            pie={
              enlaceWspGeneral ? (
                <div className="rounded-2xl border border-(--carta-borde) bg-(--carta-superficie) p-7">
                  <p className="text-lg font-semibold tracking-tight">
                    ¿Dudas con algún plato?
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-(--carta-suave)">
                    Escríbenos y te contamos qué lleva, cuánto demora o si podemos ajustarlo.
                  </p>
                  <a
                    href={enlaceWspGeneral}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex items-center gap-2 rounded-xl border border-(--carta-borde) px-5 py-3 text-sm font-semibold transition-colors hover:border-(--carta-acento) hover:text-(--carta-acento)"
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                    Escríbenos por WhatsApp
                  </a>
                </div>
              ) : null
            }
          />
        )}
      </div>

      <ComoPedir />

      <MapaUbicacion
        nombre={empresa?.nombre ?? 'Nuestro local'}
        direccion={empresa?.direccion ?? null}
        telefono={empresa?.telefono ?? null}
      />

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

      <ModalPlatillo
        producto={platilloAbierto}
        cantidadEnBandeja={cantidadPlatilloAbierto}
        onAgregar={() => platilloAbierto && bandeja.agregar(platilloAbierto.id)}
        onQuitarUna={() =>
          platilloAbierto &&
          bandeja.cambiarCantidad(platilloAbierto.id, cantidadPlatilloAbierto - 1)
        }
        onCerrar={() => setPlatilloAbierto(null)}
        nombreRestaurante={nombreRestaurante}
        telefonoWhatsApp={empresa?.telefono ?? null}
      />
    </div>
  );
}
