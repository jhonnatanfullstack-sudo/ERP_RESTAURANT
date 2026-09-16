import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { Login } from './Login';

const login = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

describe('Login', () => {
  it('muestra los campos de correo y contraseña, y el botón de ingresar', () => {
    renderLogin();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  it('envía las credenciales escritas al enviar el formulario', async () => {
    login.mockResolvedValueOnce(undefined);
    const usuario = userEvent.setup();
    renderLogin();

    await usuario.type(screen.getByLabelText('Correo electrónico'), 'admin@restaurant.local');
    await usuario.type(screen.getByLabelText('Contraseña'), 'CambiarInmediatamente123!');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('admin@restaurant.local', 'CambiarInmediatamente123!');
    });
  });

  it('muestra un error cuando las credenciales son inválidas', async () => {
    login.mockRejectedValueOnce(new Error('401'));
    const usuario = userEvent.setup();
    renderLogin();

    await usuario.type(screen.getByLabelText('Correo electrónico'), 'admin@restaurant.local');
    await usuario.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByText('Credenciales inválidas')).toBeInTheDocument();
  });
});
