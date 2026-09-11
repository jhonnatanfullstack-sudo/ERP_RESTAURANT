import { useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChefHat, MapPin, Phone } from 'lucide-react';
import * as empresaService from '../services/empresa.service';
import { enlaceWhatsApp } from '../utils/whatsapp';

export function PublicLayout() {
  const { slug = '' } = useParams<{ slug: string }>();
  const empresaQuery = useQuery({
    queryKey: ['empresa-publica', slug],
    queryFn: () => empresaService.obtenerEmpresaPublica(slug),
    enabled: slug.length > 0,
  });
  const empresa = empresaQuery.data;
  const nombre = empresa?.nombre ?? 'Restaurant ERP';
  // `logo` es una URL/ruta escrita a mano en Empresa (sección en curso, sin subida de
  // archivo todavía): si no carga, se vuelve al ícono por defecto en vez de dejar un
  // hueco en blanco.
  const [logoFallo, setLogoFallo] = useState(false);
  const mostrarLogo = !!empresa?.logo && !logoFallo;
  const enlaceWsp = empresa?.telefono
    ? enlaceWhatsApp(empresa.telefono, `Hola ${nombre}, quisiera hacer una consulta.`)
    : null;

  return (
    // `data-tema="carta"` activa la paleta propia de la superficie pública (ver index.css),
    // que sigue el modo claro/oscuro del sistema. El panel interno no la usa.
    <div
      data-tema="carta"
      className="flex min-h-[100dvh] flex-col bg-(--carta-fondo) text-(--carta-texto)"
    >
      <header className="sticky top-0 z-30 border-b border-(--carta-borde) bg-(--carta-fondo)/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-5 sm:px-8">
          {mostrarLogo ? (
            <img
              src={empresa.logo!}
              alt={nombre}
              className="h-9 w-9 shrink-0 rounded-xl object-cover"
              onError={() => setLogoFallo(true)}
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--carta-acento)">
              <ChefHat className="h-5 w-5 text-(--carta-acento-contraste)" strokeWidth={2.25} />
            </div>
          )}
          <span className="truncate text-[15px] font-semibold tracking-tight">{nombre}</span>

          {enlaceWsp && (
            <a
              href={enlaceWsp}
              target="_blank"
              rel="noreferrer"
              className="ml-auto hidden shrink-0 items-center gap-2 rounded-xl border border-(--carta-borde) px-3.5 py-2 text-sm font-medium transition-colors hover:bg-(--carta-elevado) sm:flex"
            >
              <Phone className="h-4 w-4" strokeWidth={2} />
              WhatsApp
            </a>
          )}
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-(--carta-borde)">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-10 text-sm text-(--carta-suave) sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="font-medium text-(--carta-texto)">{nombre}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {empresa?.direccion && (
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" strokeWidth={2} />
                {empresa.direccion}
              </span>
            )}
            {empresa?.telefono && (
              <a
                href={`tel:${empresa.telefono}`}
                className="flex items-center gap-2 transition-colors hover:text-(--carta-acento)"
              >
                <Phone className="h-4 w-4 shrink-0" strokeWidth={2} />
                {empresa.telefono}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
