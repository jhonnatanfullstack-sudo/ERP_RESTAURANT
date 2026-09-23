import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvisoSuscripcion } from './AvisoSuscripcion';
import * as suscripcionService from '../services/suscripcion.service';
import type { ResumenSuscripcion } from '../types/api';

const contacto = { nombre: 'Soporte ERP', email: 'soporte@erp.test', telefono: '999888777' };

function resumen(overrides: Partial<ResumenSuscripcion>): ResumenSuscripcion {
  return {
    estado: 'demo',
    plan: 'demo',
    diasRestantes: 10,
    expiraEn: '2026-10-01T00:00:00.000Z',
    puedeEscribir: true,
    contactoProveedor: contacto,
    ...overrides,
  };
}

function renderizar(datos: ResumenSuscripcion | undefined) {
  vi.spyOn(suscripcionService, 'obtenerSuscripcion').mockResolvedValue(datos as ResumenSuscripcion);
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={cliente}>
      <AvisoSuscripcion />
    </QueryClientProvider>,
  );
}

describe('AvisoSuscripcion', () => {
  it('no muestra nada cuando la cuenta está activa', async () => {
    renderizar(resumen({ estado: 'activa', diasRestantes: null }));
    expect(await screen.findByRole('status').catch(() => null)).toBeNull();
    expect(screen.queryByText(/prueba/i)).not.toBeInTheDocument();
  });

  it('durante la prueba activa muestra los días restantes y un botón para ver planes', async () => {
    renderizar(resumen({ estado: 'demo', diasRestantes: 10 }));
    expect(await screen.findByText('Te quedan 10 días de prueba')).toBeInTheDocument();
    const enlace = screen.getByRole('link', { name: /ver planes/i });
    expect(enlace).toHaveAttribute('href', '/precios');
  });

  it('cuando la prueba está por vencer, agrega el contacto del proveedor', async () => {
    renderizar(resumen({ estado: 'demo', diasRestantes: 2 }));
    expect(await screen.findByText('Te quedan 2 días de prueba')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver planes/i })).toBeInTheDocument();
    expect(screen.getByText(contacto.telefono)).toBeInTheDocument();
  });

  it('cuando la prueba venció, ofrece elegir un plan', async () => {
    renderizar(resumen({ estado: 'demo_vencida', diasRestantes: 0 }));
    expect(await screen.findByText('Tu prueba terminó.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /elige un plan/i })).toHaveAttribute('href', '/precios');
  });
});
