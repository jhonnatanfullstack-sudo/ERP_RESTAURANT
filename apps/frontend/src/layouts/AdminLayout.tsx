import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { Navbar } from '../components/Navbar';
import { AvisoSuscripcion } from '../components/AvisoSuscripcion';

const CLAVE_COLAPSADO = 'restaurant-erp:sidebar-colapsado';

export function AdminLayout() {
  const [colapsado, setColapsado] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_COLAPSADO) === '1';
    } catch {
      return false;
    }
  });
  const [abiertoMovil, setAbiertoMovil] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_COLAPSADO, colapsado ? '1' : '0');
    } catch {
      // almacenamiento no disponible (modo privado, etc.): se ignora
    }
  }, [colapsado]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-50">
      <Sidebar
        colapsado={colapsado}
        onToggleColapsado={() => setColapsado((valor) => !valor)}
        onExpandir={() => setColapsado(false)}
        abiertoMovil={abiertoMovil}
        onCerrarMovil={() => setAbiertoMovil(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar onAbrirMenuMovil={() => setAbiertoMovil(true)} />
        {/* Entre el navbar y el contenido: se ve en todas las pantallas del panel sin
            empujar el menú ni competir con el título de cada página. */}
        <AvisoSuscripcion />
        <main className="animate-fade-in flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
