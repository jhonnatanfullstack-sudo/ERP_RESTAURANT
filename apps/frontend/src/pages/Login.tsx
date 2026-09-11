import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChefHat, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Credenciales inválidas');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 shadow-sm shadow-orange-600/30">
            <ChefHat className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-zinc-900">Restaurant ERP</h1>
            <p className="text-sm text-zinc-500">Ingresa a tu panel de administración</p>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
        >
          {error && (
            <div className="mb-5">
              <Alert tipo="error" mensaje={error} />
            </div>
          )}

          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="email">
            Correo electrónico
          </label>
          <div className="relative mb-4">
            <Mail className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 py-2.5 pr-3 pl-9 text-sm placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
              placeholder="tucorreo@restaurante.com"
            />
          </div>

          <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="password">
            Contraseña
          </label>
          <div className="relative mb-6">
            <Lock className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 py-2.5 pr-3 pl-9 text-sm placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Ingresando…' : 'Iniciar sesión'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/registro" className="font-semibold text-orange-600 hover:text-orange-700">
            Prueba el sistema gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
