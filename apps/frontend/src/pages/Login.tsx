import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion, MotionConfig, useAnimationControls } from 'framer-motion';
import {
  ChefHat,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ReceiptText,
  ShieldCheck,
  Soup,
  TriangleAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useMovimientoReducido } from '../hooks/animacion';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';

/** Curva de easing "Premium" del sistema: sin rebote, decelera con suavidad. Un solo valor
 * para toda la página, como pide la identidad de movimiento (ver skill de motion-design). */
const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;

const PALABRAS_TITULAR = ['tu cocina', 'tus mesas', 'tu caja', 'tu carta', 'tu equipo'];

/** Tres promesas concretas del sistema, no adjetivos. Cada una es una capacidad que ya
 * existe detrás del panel al que da entrada este formulario. */
const RASGOS = [
  {
    icono: Soup,
    titulo: 'Salón y cocina sincronizados',
    detalle: 'Pedidos, comandas y estado de las mesas actualizándose en vivo.',
  },
  {
    icono: ReceiptText,
    titulo: 'Facturación electrónica',
    detalle: 'Boletas y facturas con series, talonarios e IGV listos para SUNAT.',
  },
  {
    icono: ShieldCheck,
    titulo: 'Los datos de tu negocio, aislados',
    detalle: 'Cada restaurante ve únicamente su propia información.',
  },
];

/** Rejilla técnica de fondo, desvanecida hacia los bordes. Va en `style` y no en clases
 * arbitrarias porque son tres declaraciones acopladas (imagen, tamaño y máscara): juntas se
 * leen como una sola decisión visual. */
const REJILLA: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(to right, rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.055) 1px, transparent 1px)',
  backgroundSize: '46px 46px',
  maskImage: 'radial-gradient(ellipse 70% 60% at 45% 35%, #000 30%, transparent 75%)',
  WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 45% 35%, #000 30%, transparent 75%)',
};

/** Clase base de los dos campos. El `peer` es lo que permite que el ícono de la izquierda se
 * tiña de naranja cuando el input toma el foco — por eso el ícono va después en el DOM. */
const CAMPO_BASE =
  'peer w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 text-sm text-zinc-900 transition placeholder:text-zinc-400 hover:border-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/15 focus:outline-none';

const ICONO_CAMPO =
  'pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-zinc-400 transition-colors peer-focus:text-orange-500';

const contenedorCampos = {
  oculto: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.18 } },
};

const campoVariantes = {
  oculto: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_PREMIUM } },
};

/** Palabra del titular que rota sola cada pocos segundos, con transición vertical de
 * entrada/salida (un cambio de estado importante necesita posición además de opacidad — ver
 * "Property Selection" de la skill de motion-design). Fija en la primera si el usuario pide
 * menos movimiento. */
function PalabraGiratoria({
  palabras,
  className = '',
}: {
  palabras: string[];
  className?: string;
}) {
  const movimientoReducido = useMovimientoReducido();
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (movimientoReducido) return;
    const id = setInterval(() => setIndice((i) => (i + 1) % palabras.length), 2800);
    return () => clearInterval(id);
  }, [movimientoReducido, palabras.length]);

  const masLarga = palabras.reduce((a, b) => (b.length > a.length ? b : a), '');
  const actual = movimientoReducido ? palabras[0] : palabras[indice];

  return (
    <span className="relative inline-grid overflow-hidden pb-1 align-bottom">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {masLarga}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={actual}
          initial={movimientoReducido ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.4, ease: EASE_PREMIUM }}
          className={`col-start-1 row-start-1 text-left ${className}`}
        >
          {actual}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Marca del producto. Se repite en el panel oscuro y en la cabecera móvil del formulario,
 * que son dos contextos de color distintos: por eso el fondo del logotipo es siempre el
 * mismo degradado naranja y lo único que cambia es el color del texto. */
function Marca({ claseTexto = 'text-white' }: { claseTexto?: string }) {
  return (
    <span className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-950/25 ring-1 ring-white/25">
        <ChefHat className="h-5 w-5 text-white" strokeWidth={2.25} />
      </span>
      <span className={`text-[15px] font-bold tracking-tight ${claseTexto}`}>
        Restaurant <span className="text-orange-500">ERP</span>
      </span>
    </span>
  );
}

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [bloqMayus, setBloqMayus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const controlesTarjeta = useAnimationControls();

  // Entrada de la tarjeta al montar. Va en un efecto (no en `animate` con variantes) porque
  // más abajo, ante un error, el mismo control dispara la sacudida — un solo objeto de
  // controles para las dos animaciones evita que compitan entre sí.
  useEffect(() => {
    void controlesTarjeta.start({
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: EASE_PREMIUM },
    });
  }, [controlesTarjeta]);

  /** Bloq Mayús es la causa silenciosa más común de un "contraseña incorrecta": el campo la
   * oculta, así que sin este aviso el usuario no tiene cómo ver lo que está escribiendo mal. */
  function revisarBloqMayus(e: React.KeyboardEvent<HTMLInputElement>) {
    setBloqMayus(e.getModifierState('CapsLock'));
  }

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
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Panel de marca — solo en pantallas grandes. El movimiento se limita a dos capas:
            las auras que respiran de fondo (ambiente) y la palabra giratoria del titular
            (foco). Todo lo demás entra una vez y se queda quieto, para que la atención
            termine en el formulario y no en la decoración. */}
        <div className="relative hidden overflow-hidden bg-zinc-950 lg:flex lg:flex-col lg:justify-between lg:p-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={REJILLA}
          />

          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -top-48 -left-40 h-[36rem] w-[36rem] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(234,88,12,0.45), transparent 65%)' }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -right-40 -bottom-56 h-[34rem] w-[34rem] rounded-full blur-3xl"
            style={{
              background: 'radial-gradient(circle, rgba(245,158,11,0.28), transparent 68%)',
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.85, 0.5] }}
            transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_PREMIUM }}
            className="relative"
          >
            <Marca />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_PREMIUM, delay: 0.1 }}
            className="relative max-w-lg"
          >
            <h2 className="text-[2.6rem] leading-[1.12] font-bold tracking-tight text-white">
              Gestiona{' '}
              <PalabraGiratoria
                palabras={PALABRAS_TITULAR}
                className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent"
              />
              <br />
              de principio a fin
            </h2>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-zinc-400">
              Un solo sistema para la carta, las mesas, la cocina, la caja y la facturación
              electrónica de tu negocio.
            </p>

            <ul className="mt-10 flex flex-col gap-3">
              {RASGOS.map((rasgo, indice) => (
                <motion.li
                  key={rasgo.titulo}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.45, ease: EASE_PREMIUM, delay: 0.3 + indice * 0.09 }}
                  className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-sm transition-colors hover:border-orange-400/25 hover:bg-white/[0.07]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-300 ring-1 ring-orange-400/25 ring-inset">
                    <rasgo.icono className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{rasgo.titulo}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-zinc-400">
                      {rasgo.detalle}
                    </span>
                  </span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <p className="relative border-t border-white/10 pt-6 text-xs text-zinc-500">
            Hecho para restaurantes, cafeterías y negocios de comida en Perú.
          </p>
        </div>

        {/* Formulario */}
        <div className="relative flex items-center justify-center overflow-hidden bg-zinc-50 px-5 py-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(70% 45% at 50% 0%, rgba(249,115,22,0.10), transparent 70%)',
            }}
          />

          <div className="relative w-full max-w-[25rem]">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE_PREMIUM }}
              className="mb-8 flex justify-center lg:hidden"
            >
              <Marca claseTexto="text-zinc-900" />
            </motion.div>

            <motion.form
              onSubmit={(e) => void handleSubmit(e)}
              initial={{ opacity: 0, y: 20 }}
              animate={controlesTarjeta}
              className="rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_16px_40px_-20px_rgba(24,24,27,0.25)]"
            >
              <div className="mb-6">
                <h1 className="text-[1.375rem] font-bold tracking-tight text-zinc-900">
                  Bienvenido de nuevo
                </h1>
                <p className="mt-1 text-sm text-zinc-500">Ingresa a tu panel de administración</p>
              </div>

              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    key="error"
                    // El mensaje aparece sin mover el foco; `alert` es lo que hace que un
                    // lector de pantalla igual lo anuncie.
                    role="alert"
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
                className="flex flex-col gap-4"
              >
                <motion.div variants={campoVariantes}>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700" htmlFor="email">
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <input
                      id="email"
                      type="email"
                      required
                      autoFocus
                      autoComplete="username"
                      spellCheck={false}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`${CAMPO_BASE} pr-3.5`}
                      placeholder="tucorreo@restaurante.com"
                    />
                    <Mail className={ICONO_CAMPO} />
                  </div>
                </motion.div>

                <motion.div variants={campoVariantes}>
                  <label
                    className="mb-1.5 block text-sm font-medium text-zinc-700"
                    htmlFor="password"
                  >
                    Contraseña
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={verPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={revisarBloqMayus}
                      onKeyDown={revisarBloqMayus}
                      onBlur={() => setBloqMayus(false)}
                      className={`${CAMPO_BASE} pr-11`}
                      placeholder="••••••••"
                    />
                    <Lock className={ICONO_CAMPO} />
                    <button
                      type="button"
                      onClick={() => setVerPassword((v) => !v)}
                      aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      aria-pressed={verPassword}
                      className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 focus-visible:ring-2 focus-visible:ring-orange-500/40 focus-visible:outline-none"
                    >
                      {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {bloqMayus && (
                      <motion.p
                        key="mayus"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: EASE_PREMIUM }}
                        className="overflow-hidden text-xs text-amber-600"
                      >
                        <span className="mt-1.5 flex items-center gap-1.5">
                          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                          Bloq Mayús está activado
                        </span>
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>

                <motion.div variants={campoVariantes} className="mt-2">
                  <Button
                    type="submit"
                    cargando={enviando}
                    className="group relative w-full overflow-hidden py-3"
                  >
                    {/* Destello diagonal que recorre el botón al pasar el mouse — un solo
                        barrido, no un loop: es una recompensa al gesto, no ambiente. */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                    {enviando ? 'Ingresando…' : 'Iniciar sesión'}
                  </Button>
                </motion.div>
              </motion.div>

              {/* El sistema todavía no tiene recuperación de contraseña por correo; decirlo acá
                  evita que alguien se quede buscando un enlace que no existe. */}
              <p className="mt-5 border-t border-zinc-100 pt-5 text-center text-xs leading-relaxed text-zinc-400">
                ¿Olvidaste tu contraseña? Pídele al administrador de tu restaurante que la
                restablezca.
              </p>
            </motion.form>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.55 }}
              className="mt-6 text-center"
            >
              <p className="text-sm text-zinc-500">
                ¿Aún no tienes cuenta?{' '}
                <Link
                  to="/registro"
                  className="font-semibold text-orange-600 hover:text-orange-700"
                >
                  Prueba el sistema gratis
                </Link>
              </p>
              <p className="mt-1.5 text-xs text-zinc-400">
                <Link to="/precios" className="transition-colors hover:text-zinc-600">
                  Ver planes y precios
                </Link>
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
