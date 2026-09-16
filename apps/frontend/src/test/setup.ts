import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// `@testing-library/react` limpia el DOM solo si detecta un `afterEach` global — se registra
// explícito para no depender de esa detección automática.
afterEach(() => {
  cleanup();
});

// jsdom no implementa `matchMedia` — lo usa `useMovimientoReducido` (hooks/animacion.ts) en
// casi toda página animada de la app, así que sin este polyfill cualquier componente que lo
// use revienta al montarse en una prueba.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom tampoco implementa `IntersectionObserver`/`ResizeObserver`, que framer-motion usa para
// `whileInView` (revelado al hacer scroll) — omnipresente en la carta pública.
class ObservadorFalso {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
}
vi.stubGlobal('IntersectionObserver', ObservadorFalso);
vi.stubGlobal('ResizeObserver', ObservadorFalso);
