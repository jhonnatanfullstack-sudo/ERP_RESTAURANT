import { useState } from 'react';
import { Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChefHat, MapPin, Phone } from 'lucide-react';
import * as empresaService from '../services/empresa.service';
import { enlaceWhatsApp } from '../utils/whatsapp';

export function PublicLayout() {
  const empresaQuery = useQuery({
    queryKey: ['empresa-publica'],
    queryFn: empresaService.obtenerEmpresaPublica,
  });
  const empresa = empresaQuery.data;
  const nombre = empresa?.nombre ?? 'Restaurant ERP';
  // `logo` es una URL/ruta escrita a mano en Empresa (sección en curso, sin subida de
  // archivo todavía) — si no carga, se vuelve al ícono por defecto en vez de dejar un
  // hueco en blanco.
  const [logoFallo, setLogoFallo] = useState(false);
  const mostrarLogo = !!empresa?.logo && !logoFallo;
  const enlaceWsp = empresa?.telefono
    ? enlaceWhatsApp(empresa.telefono, `¡Hola ${nombre}! Quisiera hacer una consulta.`)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-4">
          {mostrarLogo ? (
            <img
              src={empresa.logo!}
              alt={nombre}
              className="h-9 w-9 shrink-0 rounded-lg object-cover"
              onError={() => setLogoFallo(true)}
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-600">
              <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
          )}
          <span className="truncate text-lg font-bold tracking-tight text-zinc-900">{nombre}</span>

          {enlaceWsp && (
            <a
              href={enlaceWsp}
              target="_blank"
              rel="noreferrer"
              className="ml-auto hidden shrink-0 items-center gap-2 rounded-full bg-[#25D366]/10 px-3.5 py-2 text-sm font-semibold text-[#128C4A] transition-colors hover:bg-[#25D366]/20 sm:flex"
            >
              <Phone className="h-4 w-4" strokeWidth={2.25} />
              WhatsApp
            </a>
          )}
        </div>
      </header>

      <main className="animate-fade-in flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-6 py-8 text-center text-sm text-zinc-500 sm:flex-row sm:justify-between sm:text-left">
          <p className="font-medium text-zinc-700">{nombre}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
            {empresa?.direccion && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                {empresa.direccion}
              </span>
            )}
            {empresa?.telefono && (
              <a
                href={`tel:${empresa.telefono}`}
                className="flex items-center gap-1.5 transition-colors hover:text-orange-600"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                {empresa.telefono}
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
