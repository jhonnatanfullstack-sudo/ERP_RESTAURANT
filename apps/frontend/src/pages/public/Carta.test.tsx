import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Carta } from './Carta';
import type { EmpresaPublica, Producto } from '../../types/api';

const unidad = { id: 'u1', codigo: 'NIU', nombre: 'Unidad' };
const igv = { id: 'i1', codigo: '10', nombre: 'Gravado' };

function producto(overrides: Partial<Producto>): Producto {
  return {
    id: overrides.id ?? 'p1',
    categoria: { id: 'c1', nombre: 'Entradas' },
    marca: null,
    unidadMedida: unidad,
    tipoAfectacionIgv: igv,
    tipo: 'servicio',
    nombre: 'Causa limeña',
    descripcion: 'Papa amarilla con pollo',
    precio: 18,
    imagenUrl: null,
    activo: true,
    nombreCompleto: 'Causa limeña',
    ...overrides,
  };
}

const productos: Producto[] = [
  producto({ id: 'p1', nombre: 'Causa limeña', nombreCompleto: 'Causa limeña', precio: 18 }),
  producto({
    id: 'p2',
    nombre: 'Lomo saltado',
    nombreCompleto: 'Lomo saltado',
    precio: 25,
    categoria: { id: 'c2', nombre: 'Fondos' },
  }),
];

const empresa: EmpresaPublica = {
  nombre: 'LOS FRUTIFANTASTICOS',
  direccion: 'Av. José Balta',
  telefono: '908713198',
  logo: null,
  horarioAtencion: 'Lun a Dom de 11:00 a 23:00',
  mensajeBienvenida: null,
  aceptaPedidosWhatsapp: true,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  qrPagoYape: null,
  qrPagoPlin: null,
};

vi.mock('../../services/productos.service', () => ({
  listarProductosPublico: vi.fn(async () => productos),
}));
vi.mock('../../services/empresa.service', () => ({
  obtenerEmpresaPublica: vi.fn(async () => empresa),
}));
vi.mock('../../services/mesas.service', () => ({
  obtenerMesaPublica: vi.fn(async () => null),
}));

function renderCarta() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/carta/frutifantasticos']}>
        <Routes>
          <Route path="/carta/:slug" element={<Carta />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Carta pública', () => {
  it('muestra el nombre de la empresa y los platos agrupados por categoría', async () => {
    renderCarta();

    expect(await screen.findByText('LOS FRUTIFANTASTICOS')).toBeInTheDocument();
    expect(await screen.findByText('Causa limeña')).toBeInTheDocument();
    expect(screen.getByText('Lomo saltado')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Entradas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Fondos' })).toBeInTheDocument();
  });

  it('el buscador filtra los platos por nombre', async () => {
    const usuario = userEvent.setup();
    renderCarta();
    await screen.findByText('Causa limeña');

    await usuario.type(screen.getByPlaceholderText('Buscar un plato'), 'lomo');

    await waitFor(() => {
      expect(screen.queryByText('Causa limeña')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Lomo saltado')).toBeInTheDocument();
  });

  it('agregar un plato muestra el botón flotante "Mi pedido" con el contador', async () => {
    const usuario = userEvent.setup();
    renderCarta();
    await screen.findByText('Causa limeña');

    await usuario.click(screen.getByRole('button', { name: 'Agregar Causa limeña al pedido' }));

    const botonPedido = await screen.findByRole('button', { name: /Ver mi pedido, 1 producto/ });
    expect(botonPedido).toBeInTheDocument();
  });
});
