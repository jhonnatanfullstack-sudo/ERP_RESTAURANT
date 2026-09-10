import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { useEnVista } from '../../hooks/useEnVista';

interface MapaUbicacionProps {
  nombre: string;
  /** Dirección registrada de la empresa. Sin ella no hay nada que ubicar y la sección no se pinta. */
  direccion: string | null;
  telefono: string | null;
}

/**
 * Ubicación del local sobre el mapa. Usa el embed público de Google Maps por dirección
 * (`output=embed`), que no requiere clave de API ni instalar un SDK: para un local fijo
 * basta con el texto de la dirección registrada en Empresa. Si algún día se necesita el pin
 * exacto, habría que guardar latitud/longitud y cambiar la `q` por las coordenadas.
 */
export function MapaUbicacion({ nombre, direccion, telefono }: MapaUbicacionProps) {
  const { ref, visible } = useEnVista<HTMLDivElement>();

  if (!direccion) return null;

  const consulta = encodeURIComponent(direccion);
  const urlMapa = `https://maps.google.com/maps?q=${consulta}&z=16&output=embed`;
  const urlComoLlegar = `https://www.google.com/maps/dir/?api=1&destination=${consulta}`;

  return (
    <section id="ubicacion" className="border-t border-(--carta-borde) py-16 sm:py-24">
      <div
        ref={ref}
        className={`mx-auto grid max-w-6xl gap-10 px-5 transition-all duration-700 ease-out sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16 ${
          visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dónde estamos</h2>
          <p className="mt-4 max-w-md leading-relaxed text-(--carta-suave)">
            Te esperamos en el local. También puedes escribirnos antes de venir para reservar o
            consultar por un plato.
          </p>

          <dl className="mt-8 space-y-5">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-(--carta-acento)" strokeWidth={2} />
              <div>
                <dt className="text-sm font-medium">{nombre}</dt>
                <dd className="mt-0.5 text-sm text-(--carta-suave)">{direccion}</dd>
              </div>
            </div>

            {telefono && (
              <div className="flex gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-(--carta-acento)" strokeWidth={2} />
                <div>
                  <dt className="text-sm font-medium">Teléfono</dt>
                  <dd className="mt-0.5 text-sm">
                    <a
                      href={`tel:${telefono}`}
                      className="text-(--carta-suave) transition-colors hover:text-(--carta-acento)"
                    >
                      {telefono}
                    </a>
                  </dd>
                </div>
              </div>
            )}
          </dl>

          <a
            href={urlComoLlegar}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex items-center gap-2 rounded-xl bg-(--carta-texto) px-5 py-3 text-sm font-semibold text-(--carta-fondo) transition-opacity hover:opacity-90 active:translate-y-px"
          >
            Cómo llegar
            <ExternalLink className="h-4 w-4" strokeWidth={2.25} />
          </a>
        </div>

        <div className="overflow-hidden rounded-3xl border border-(--carta-borde)">
          <iframe
            src={urlMapa}
            title={`Ubicación de ${nombre}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-80 w-full sm:h-105"
          />
        </div>
      </div>
    </section>
  );
}
