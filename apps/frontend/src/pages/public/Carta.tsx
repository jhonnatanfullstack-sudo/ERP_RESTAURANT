import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion, useScroll, useTransform } from 'framer-motion';
import { AlertTriangle, MessageCircle, Search, UtensilsCrossed, X } from 'lucide-react';
import * as productosService from '../../services/productos.service';
import * as empresaService from '../../services/empresa.service';
import * as mesasService from '../../services/mesas.service';
import { EmptyState } from '../../components/ui/EmptyState';
import { SeccionCategoriaBento } from '../../components/public/SeccionCategoriaBento';
import { GrillaBento } from '../../components/public/GrillaBento';
import { SeccionRevelada } from '../../components/public/SeccionRevelada';
import { BandejaPedidoFlotante } from '../../components/public/BandejaPedidoFlotante';
import { BotonSubir } from '../../components/public/BotonSubir';
import { ModalPlatillo } from '../../components/public/ModalPlatillo';
import { BarraProgresoLectura } from '../../components/public/BarraProgresoLectura';
import { PalabraRotativa } from '../../components/public/PalabraRotativa';
import { ComoPedir } from '../../components/public/ComoPedir';
import { MapaUbicacion } from '../../components/public/MapaUbicacion';
import { BotonCompartir } from '../../components/public/BotonCompartir';
import { useBandejaPedido } from '../../hooks/useBandejaPedido';
import { useMetaDocumento } from '../../hooks/useMetaDocumento';
import { useMovimientoReducido } from '../../hooks/animacion';
import { useTilt3D } from '../../hooks/useTilt3D';
import { enlaceWhatsApp } from '../../utils/whatsapp';
import { urlImagen } from '../../utils/formato';
import type { GrupoCategoria } from '../../components/public/SeccionCategoriaBento';
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
  // Qué restaurante publica esta carta. Viene de la URL (`/carta/:slug`) porque un cliente
  // mirando el menú no tiene sesión: no hay otra forma de saber de quién es la carta.
  const { slug = '' } = useParams<{ slug: string }>();
  // `?mesa=<id>` es lo que codifica el QR pegado en la mesa (ver Mesas.tsx en el panel
  // administrativo): con eso presente, el pedido se registra como autopedido a esa mesa en
  // vez de preguntar cómo se quiere recibir — ya se sabe, está sentado ahí.
  const [parametros] = useSearchParams();
  const mesaId = parametros.get('mesa');
  const [busqueda, setBusqueda] = useState('');
  const [platilloAbierto, setPlatilloAbierto] = useState<Producto | null>(null);
  const bandeja = useBandejaPedido();
  const movimientoReducido = useMovimientoReducido();
  // Giro 3D del clúster de fotos del hero. Un poco menos marcado que el de las teselas:
  // es una pieza grande y el mismo ángulo ahí se ve exagerado.
  const {
    ref: refHero,
    alMover: moverHero,
    alSalir: salirHero,
  } = useTilt3D({ grados: 6, acercar: 1 });

  // Parallax sutil de la foto del hero: se mueve un poco más lento que el scroll, así se lee
  // con algo de profundidad en vez de ir pegada al resto de la página (ambient layer de la
  // skill de motion design). `MotionConfig reducedMotion="user"` en `PublicLayout` ya lo
  // desactiva solo si el sistema pide menos movimiento.
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: progresoHero } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const desplazamientoFotoHero = useTransform(progresoHero, [0, 1], [0, 70]);

  const productosQuery = useQuery({
    queryKey: ['productos-publico', slug],
    queryFn: () => productosService.listarProductosPublico(slug),
    enabled: slug.length > 0,
  });
  const empresaQuery = useQuery({
    queryKey: ['empresa-publica', slug],
    queryFn: () => empresaService.obtenerEmpresaPublica(slug),
    enabled: slug.length > 0,
  });
  const mesaQuery = useQuery({
    queryKey: ['mesa-publica', slug, mesaId],
    queryFn: () => mesasService.obtenerMesaPublica(slug, mesaId!),
    enabled: slug.length > 0 && !!mesaId,
  });
  const empresa = empresaQuery.data;

  const { cambiarEntrega } = bandeja;
  const mesaData = mesaQuery.data;
  useEffect(() => {
    if (mesaData) {
      cambiarEntrega({ modo: 'mesa', mesaId: mesaData.id, mesaNumero: mesaData.numero });
    }
  }, [mesaData, cambiarEntrega]);
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
        producto.nombreCompleto.toLowerCase().includes(termino) ||
        (producto.descripcion?.toLowerCase().includes(termino) ?? false),
    );
    return encontrados.length === 0
      ? []
      : [
          {
            categoria: { id: 'busqueda', nombre: `Resultados (${encontrados.length})` },
            productos: encontrados,
          },
        ];
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

  // Con foto, para el clúster del hero y la grilla de destacados: sin foto no hay nada
  // vistoso que mostrar en ninguno de los dos.
  const conFoto = useMemo(
    () => productos.filter((producto) => urlImagen(producto.imagenUrl) !== null),
    [productos],
  );
  const fotoHero = conFoto[0]
    ? { url: urlImagen(conFoto[0].imagenUrl)!, nombre: conFoto[0].nombreCompleto }
    : null;
  // Acompañan a la foto principal del hero en el clúster bento: dos teselas chicas al lado,
  // no una fila completa (la portada ya tiene poco alto para permitirse mucho más).
  const fotosAcompanantes = useMemo(
    () =>
      conFoto.slice(1, 3).map((p) => ({ url: urlImagen(p.imagenUrl)!, nombre: p.nombreCompleto })),
    [conFoto],
  );
  // El plato del hero (y sus acompañantes) no se repiten en la grilla de recomendados de más
  // abajo; tope de 8 porque más no se lee mejor, solo alarga la sección.
  const destacados = useMemo(
    () => conFoto.filter((p) => p.id !== conFoto[0]?.id).slice(2, 10),
    [conFoto],
  );

  // El enlace de la carta se comparte por chat: ahí se ve este título, esta descripción y
  // esta foto, no el título genérico del `index.html`.
  useMetaDocumento({
    titulo: empresa ? `Carta de ${empresa.nombre}` : 'Carta digital',
    descripcion: empresa
      ? `Mira la carta de ${empresa.nombre} con fotos y precios al día, arma tu pedido y envíalo por WhatsApp.`
      : null,
    imagen: fotoHero?.url ?? null,
  });

  const cantidadPlatilloAbierto = platilloAbierto
    ? (bandeja.items.find((item) => item.productoId === platilloAbierto.id)?.cantidad ?? 0)
    : 0;

  const gruposVisibles = buscando ? gruposBusqueda : grupos;

  // Un local que solo atiende en salón publica su menú sin invitar a pedir: se oculta la
  // bandeja y los botones de agregar, pero la carta se ve completa.
  const permitirPedidos = empresa?.aceptaPedidosWhatsapp !== false;

  return (
    <div>
      <BarraProgresoLectura />

      {/* Hero: el titular manda y la foto entra desde el borde de la pantalla, sin quedar
          encajada en una tarjeta centrada. */}
      <section ref={heroRef} className="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-28">
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
              // parte en tres líneas, cortando la frase por la mitad. En móvil arranca más
              // chico porque la palabra rotativa reserva el ancho de la más larga
              // ("almuerzo."): a 2.6rem ya no cabía junto a "Elige tu" y la línea se partía,
              // dejando un hueco del ancho de la palabra.
              className="animar-revelar mt-6 text-[2.05rem] leading-[1.05] font-semibold tracking-tight sm:text-5xl sm:leading-[1.02] lg:text-6xl"
              style={{ animationDelay: '150ms' }}
            >
              Elige tu <PalabraRotativa palabras={['almuerzo.', 'antojo.', 'cena.', 'menú.']} />
              <br />
              Pide por WhatsApp.
            </h1>
            <p
              className="animar-revelar mt-6 max-w-sm text-base leading-relaxed text-(--carta-suave)"
              style={{ animationDelay: '240ms' }}
            >
              {/* El restaurante puede poner su propio mensaje en Configuración; si no, se usa
                  uno genérico que describe lo que la carta hace. */}
              {empresa?.mensajeBienvenida ??
                (permitirPedidos
                  ? 'Toda la carta con fotos y precios al día. Arma tu pedido y envíalo en un toque.'
                  : 'Toda la carta con fotos y precios al día.')}
            </p>
            {empresa?.horarioAtencion && (
              <p
                className="animar-revelar mt-3 text-sm font-medium text-(--carta-acento)"
                style={{ animationDelay: '270ms' }}
              >
                {empresa.horarioAtencion}
              </p>
            )}

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
              <BotonCompartir
                titulo={`Carta de ${nombreRestaurante}`}
                texto={`Mira la carta de ${nombreRestaurante} y pide por WhatsApp.`}
              />
            </div>
          </div>

          {fotoHero && (
            <div className="animar-revelar relative" style={{ animationDelay: '420ms' }}>
              {/* Dos manchas de color (no una) para que el resplandor de fondo tenga algo de
                  profundidad en vez de leerse como un solo círculo plano. */}
              <div
                aria-hidden="true"
                className="animar-resplandor absolute -inset-6 rounded-full bg-(--carta-acento)/10 blur-3xl"
              />
              <div
                aria-hidden="true"
                className="animar-flotar absolute -top-10 -left-10 h-40 w-40 rounded-full bg-(--carta-acento)/15 blur-3xl sm:h-56 sm:w-56"
              />

              {/* Clúster bento montado como una escena 3D: el conjunto entero se inclina
                  siguiendo al puntero y cada pieza vive a distinta altura, así que al girar se
                  desplazan unas respecto a otras (paralaje real, no una sombra que lo simula).
                  La foto principal más dos teselas chicas al lado solo desde `sm`, donde hay
                  ancho para las tres; en móvil queda la principal, apaisada bajo el titular. */}
              <div
                className="escena-3d relative"
                onPointerMove={moverHero}
                onPointerLeave={salirHero}
              >
                <div ref={refHero} className="tarjeta-3d relative grid grid-cols-3 gap-3 sm:gap-4">
                  <div className="group relative col-span-3 overflow-hidden rounded-3xl shadow-xl shadow-black/10 transition-shadow duration-500 hover:shadow-2xl hover:shadow-black/25 sm:col-span-2">
                    <motion.img
                      src={fotoHero.url}
                      alt={fotoHero.nombre}
                      style={{ y: desplazamientoFotoHero }}
                      className="aspect-16/10 w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:aspect-4/3"
                    />

                    <div className="tarjeta-3d__brillo absolute inset-0" />

                    {/* Insignia flotante con un dato real (nunca inventado): cuántos platos
                        tiene la carta hoy. Es la capa que más se despega de la foto. */}
                    {productos.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.85, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.9, ease: [0.4, 0, 0.2, 1] }}
                        style={{ '--profundidad': '42px' } as React.CSSProperties}
                        className="tarjeta-3d__capa absolute bottom-4 left-4 flex items-center gap-2.5 rounded-2xl bg-(--carta-superficie)/90 px-4 py-3 shadow-xl backdrop-blur-sm sm:bottom-6 sm:left-6"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--carta-acento) text-sm font-bold text-(--carta-acento-contraste)">
                          {productos.length}
                        </span>
                        <span className="text-xs leading-tight font-semibold text-(--carta-texto)">
                          platos
                          <br />
                          en la carta
                        </span>
                      </motion.div>
                    )}
                  </div>

                  {fotosAcompanantes.length > 0 && (
                    <div className="hidden flex-col gap-3 sm:col-span-1 sm:flex sm:gap-4">
                      {fotosAcompanantes.map((foto, indice) => (
                        <motion.div
                          key={foto.url}
                          initial={{ opacity: 0, scale: 0.94 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            duration: 0.5,
                            delay: 0.55 + indice * 0.1,
                            ease: [0.4, 0, 0.2, 1],
                          }}
                          // Las dos acompañantes flotan a alturas distintas entre sí y por
                          // delante de la foto principal: es lo que separa el clúster en
                          // planos en vez de dejarlo como un collage pegado.
                          style={
                            { '--profundidad': `${30 + indice * 22}px` } as React.CSSProperties
                          }
                          className="tarjeta-3d__capa flex-1 overflow-hidden rounded-2xl shadow-lg shadow-black/10"
                        >
                          <img
                            src={foto.url}
                            alt={foto.nombre}
                            className="h-full w-full object-cover"
                          />
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Destacados: la primera grilla bento de la página, antes de la carta completa por
          categorías. Es lo primero "vistoso" que se ve al bajar del hero — sin esto, de la
          portada se pasa directo a un encabezado de categoría. */}
      {destacados.length >= 2 && (
        <section className="border-t border-(--carta-borde) py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <SeccionRevelada className="mb-8 sm:mb-10">
              <p className="text-xs font-semibold tracking-[0.2em] text-(--carta-acento) uppercase">
                Recomendados
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Los favoritos de la casa
              </h2>
            </SeccionRevelada>

            <GrillaBento
              productos={destacados}
              items={bandeja.items}
              permitirPedidos={permitirPedidos}
              onAgregar={(id) => bandeja.agregar(id)}
              onVerDetalle={setPlatilloAbierto}
            />
          </div>
        </section>
      )}

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
                      className={`relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                        activa
                          ? 'text-(--carta-fondo)'
                          : 'text-(--carta-suave) hover:bg-(--carta-elevado) hover:text-(--carta-texto)'
                      }`}
                    >
                      {/* La píldora es un único elemento compartido (`layoutId`) que se
                          desliza de un botón a otro — al hacer clic y también al hacer scroll,
                          ya que `activa` sigue al scrollspy, no solo al clic. */}
                      {activa && (
                        <motion.span
                          layoutId="carta-categoria-activa"
                          className="absolute inset-0 rounded-lg bg-(--carta-texto)"
                          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
                        />
                      )}
                      <span className="relative">{categoria.nombre}</span>
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
          <div className="flex flex-col gap-16 sm:gap-20">
            {gruposVisibles.map((grupo, indice) => (
              <SeccionCategoriaBento
                key={grupo.categoria.id}
                grupo={grupo}
                indice={indice}
                items={bandeja.items}
                permitirPedidos={permitirPedidos}
                onAgregar={(id) => bandeja.agregar(id)}
                onVerDetalle={setPlatilloAbierto}
                registrarSeccion={registrarSeccion}
              />
            ))}

            {enlaceWspGeneral && (
              <div className="rounded-3xl border border-(--carta-borde) bg-(--carta-superficie) p-7">
                <p className="text-lg font-semibold tracking-tight">¿Dudas con algún plato?</p>
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
            )}
          </div>
        )}
      </div>

      <ComoPedir />

      <MapaUbicacion
        nombre={empresa?.nombre ?? 'Nuestro local'}
        direccion={empresa?.direccion ?? null}
        telefono={empresa?.telefono ?? null}
      />

      <BotonSubir />

      {permitirPedidos && (
        <BandejaPedidoFlotante
          slug={slug}
          items={bandeja.items}
          productos={productos}
          entrega={bandeja.entrega}
          onCambiarCantidad={bandeja.cambiarCantidad}
          onCambiarNota={bandeja.cambiarNota}
          onCambiarEntrega={bandeja.cambiarEntrega}
          onQuitar={bandeja.quitar}
          onVaciar={bandeja.vaciar}
          nombreRestaurante={nombreRestaurante}
          telefonoWhatsApp={empresa?.telefono ?? null}
          qrPagoYape={empresa?.qrPagoYape ?? null}
          qrPagoPlin={empresa?.qrPagoPlin ?? null}
        />
      )}

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
