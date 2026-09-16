import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion, MotionConfig, useAnimationControls } from 'framer-motion';
import {
  ChefHat,
  CookingPot,
  Lock,
  Mail,
  Pizza,
  ReceiptText,
  Soup,
  UtensilsCrossed,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMovimientoReducido } from '../hooks/animacion';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';

/** Curva de easing "Premium" del sistema: sin rebote, decelera con suavidad. Un solo valor
 * para toda la página, como pide la identidad de movimiento (ver skill de motion-design). */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;

const PALABRAS_TITULAR = ['tu cocina', 'tus mesas', 'tu caja', 'tu carta', 'tu equipo'];

const RASGOS = [
  { icono: Soup, texto: 'Cocina, pedidos y mesas en tiempo real' },
  { icono: ReceiptText, texto: 'Facturación electrónica SUNAT integrada' },
  { icono: UtensilsCrossed, texto: 'Todo tu restaurante, en un solo panel' },
];

/** Íconos a la deriva dentro del panel de marca — capa ambiente. Cada uno con su propia
 * posición, tamaño, duración y desfase para que el movimiento no se sienta sincronizado. */
const ICONOS_FLOTANTES = [
  { Icono: CookingPot, top: '8%', left: '78%', tamano: 46, duracion: 16, desfase: 0 },
  { Icono: Pizza, top: '32%', left: '90%', tamano: 40, duracion: 19, desfase: 2.5 },
  { Icono: ReceiptText, top: '58%', left: '6%', tamano: 36, duracion: 18, desfase: 1 },
  { Icono: Soup, top: '85%', left: '85%', tamano: 42, duracion: 21, desfase: 3.5 },
];

const contenedorCampos = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.22 } },
};

const campoVariantes = {
  oculto: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_PREMIUM } },
};

/** Palabra del titular que rota sola cada pocos segundos, con transición vertical de
 * entrada/salida (un cambio de estado importante necesita posición además de opacidad — ver
 * "Property Selection" de la skill de motion-design). Fija en la primera si el usuario pide
 * menos movimiento. */
function PalabraGiratoria({ palabras, className = '' }: { palabras: string[]; className?: string }) {
  const movimientoReducido = useMovimientoReducido();
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (movimientoReducido) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % palabras.length), 2400);
    return () => clearInterval(id);
  }, [movimientoReducido, palabras.length]);

  const masLarga = palabras.reduce((a, b) => (b.length > a.length ? b : a), '');
  const actual = movimientoReducido ? palabras[0] : palabras[indice];

  return (
    <span className="relative inline-grid overflow-hidden align-bottom">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {masLarga}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={actual}
          initial={movimientoReducido ? false : { y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_PREMIUM }}
          className={`col-start-1 row-start-1 text-left ${className}`}
        >
          {actual}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Halo tipo "radar": dos anillos que laten en cascada detrás de un ícono — capa secundaria
 * que le da vida sin competir con él. */
function HaloRadar({ colorAnillo }: { colorAnillo: string }) {
  return (
    <>
      <motion.span
        aria-hidden="true"
        className={`absolute inset-0 rounded-xl ${colorAnillo}`}
        animate={{ scale: [1, 1.7, 1.7], opacity: [0.5, 0, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
      />
      <motion.span
        aria-hidden="true"
        className={`absolute inset-0 rounded-xl ${colorAnillo}`}
        animate={{ scale: [1, 1.7, 1.7], opacity: [0.5, 0, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
      />
    </>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const controlesTarjeta = useAnimationControls();

  // Entrada de la tarjeta al montar. Va en un efecto (no en `animate` con variantes) porque
  // más abajo, ante un error, el mismo control dispara la sacudida — un solo objeto de
  // controles para las dos animaciones evita que compitan entre sí.
  useEffect(() => {
    void controlesTarjeta.start({ opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_PREMIUM } });
  }, [controlesTarjeta]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login(email, password);
      navigate('/');
    } catch {
      setError('Credenciales inválidas');
      // Sacudida corta y sin rebote: transmite "no" con firmeza, no un juego (ver patrón
      // "Error Shake" de la skill de motion-design). Solo mueve `x`: la entrada por variantes
      // ya dejó la tarjeta en su opacidad/posición final, y esta llamada no las toca.
      void controlesTarjeta.start({
        x: [0, -8, 8, -6, 6, 0],
        transition: { duration: 0.35, ease: 'easeInOut' },
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Panel de marca — solo en pantallas grandes. Varias capas de movimiento: ambiente
            (blobs + íconos a la deriva + destello rotando en el ícono grande de fondo),
            secundaria (halo del logo, rasgos con stagger) y la palabra giratoria del titular. */}
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-orange-600 via-orange-700 to-zinc-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
            animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -right-32 bottom-0 h-[28rem] w-[28rem] rounded-full bg-black/20 blur-3xl"
            animate={{ x: [0, -20, 0], y: [0, -25, 0] }}
            transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
          />

          {ICONOS_FLOTANTES.map(({ Icono, top, left, tamano, duracion, desfase }, indice) => (
            <motion.div
              key={indice}
              aria-hidden="true"
              className="pointer-events-none absolute text-white/10"
              style={{ top, left, width: tamano, height: tamano }}
              animate={{ y: [0, -16, 0], rotate: [0, 8, 0] }}
              transition={{ duration: duracion, repeat: Infinity, ease: 'easeInOut', delay: desfase }}
            >
              <Icono className="h-full w-full" strokeWidth={1.2} />
            </motion.div>
          ))}

          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -bottom-10"
            animate={{ rotate: 360 }}
            transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
          >
            <UtensilsCrossed strokeWidth={0.5} className="h-72 w-72 text-white/10" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM }}
            className="relative flex items-center gap-2.5"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
              <HaloRadar colorAnillo="bg-white/30" />
              <ChefHat className="relative h-5 w-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-lg font-bold text-white">Restaurant ERP</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.1 }}
            className="relative max-w-md"
          >
            <h2 className="text-3xl leading-tight font-bold text-white">
              Gestiona <PalabraGiratoria palabras={PALABRAS_TITULAR} className="text-white" /> de
              principio a fin
            </h2>
            <p className="mt-3 text-sm text-orange-50/80">
              Un solo sistema para la carta, las mesas, la cocina, la caja y la facturación
              electrónica de tu negocio.
            </p>

            <ul className="mt-8 flex flex-col gap-4">
              {RASGOS.map((rasgo, indice) => (
                <motion.li
                  key={rasgo.texto}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, ease: EASE_PREMIUM, delay: 0.3 + indice * 0.08 }}
                  className="flex items-center gap-3 text-sm text-white/90"
                >
                  <motion.span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15"
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: 1 + indice * 0.4,
                    }}
                  >
                    <rasgo.icono className="h-4 w-4 text-white" strokeWidth={2} />
                  </motion.span>
                  {rasgo.texto}
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <p className="relative text-xs text-white/50">
            Hecho para restaurantes, cafeterías y negocios de comida en Perú.
          </p>
        </div>

        {/* Formulario */}
        <div className="flex items-center justify-center bg-zinc-50 px-4 py-12">
          <div className="w-full max-w-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE_PREMIUM }}
              className="mb-8 flex flex-col items-center gap-3 lg:hidden"
            >
              <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-orange-600 shadow-sm shadow-orange-600/30">
                <HaloRadar colorAnillo="bg-orange-500/50" />
                <ChefHat className="relative h-6 w-6 text-white" strokeWidth={2.25} />
              </div>
              <div className="text-center">
                <h1 className="text-xl font-bold text-zinc-900">Restaurant ERP</h1>
                <p className="text-sm text-zinc-500">Ingresa a tu panel de administración</p>
              </div>
            </motion.div>

            <motion.form
              onSubmit={(e) => void handleSubmit(e)}
              initial={{ opacity: 0, y: 20 }}
              animate={controlesTarjeta}
              className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"
            >
              <div className="hidden text-center lg:mb-6 lg:block">
                <h1 className="text-xl font-bold text-zinc-900">Bienvenido de nuevo</h1>
                <p className="mt-1 text-sm text-zinc-500">Ingresa a tu panel de administración</p>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25, ease: EASE_PREMIUM }}
                    className="overflow-hidden"
                  >
                    <Alert tipo="error" mensaje={error} />
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.div
                variants={contenedorCampos}
                initial="oculto"
                animate="visible"
                className="flex flex-col"
              >
                <motion.div variants={campoVariantes}>
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
                      className="w-full rounded-lg border border-zinc-300 py-2.5 pr-3 pl-9 text-sm placeholder:text-zinc-400 transition-shadow focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                      placeholder="tucorreo@restaurante.com"
                    />
                  </div>
                </motion.div>

                <motion.div variants={campoVariantes}>
                  <label
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
                    htmlFor="password"
                  >
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
                      className="w-full rounded-lg border border-zinc-300 py-2.5 pr-3 pl-9 text-sm placeholder:text-zinc-400 transition-shadow focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                </motion.div>

                <motion.div variants={campoVariantes}>
                  <Button
                    type="submit"
                    disabled={enviando}
                    className="group relative w-full overflow-hidden"
                  >
                    {/* Destello diagonal que recorre el botón al pasar el mouse — un solo
                        barrido, no un loop: es una recompensa al gesto, no ambiente. */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                    {enviando ? 'Ingresando…' : 'Iniciar sesión'}
                  </Button>
                </motion.div>
              </motion.div>
            </motion.form>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.55 }}
              className="mt-6 text-center text-sm text-zinc-500"
            >
              ¿Aún no tienes cuenta?{' '}
              <Link to="/registro" className="font-semibold text-orange-600 hover:text-orange-700">
                Prueba el sistema gratis
              </Link>
            </motion.p>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
