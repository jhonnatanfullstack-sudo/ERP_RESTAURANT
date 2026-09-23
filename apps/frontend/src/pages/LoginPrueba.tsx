import { motion } from "motion/react";

export default function LoginPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#070707] text-white">
      <div className="grid min-h-screen lg:grid-cols-2">

        {/* PANEL IZQUIERDO */}
        <section className="relative hidden overflow-hidden lg:flex">

          {/* Luces de fondo */}
          <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />

          <div className="relative z-10 flex w-full flex-col justify-between p-12">

            {/* LOGO */}
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-xl shadow-lg shadow-orange-500/30">
                  🍴
                </div>

                <div>
                  <h1 className="text-xl font-bold">
                    Rest<span className="text-orange-400">Pro</span>
                  </h1>

                  <p className="text-xs text-white/50">
                    Restaurant Management
                  </p>
                </div>
              </div>
            </div>

            {/* CONTENIDO */}
            <div className="max-w-xl">

              <p className="mb-4 text-sm font-medium uppercase tracking-[0.3em] text-orange-400">
                Restaurant SaaS
              </p>

              <h2 className="text-5xl font-bold leading-tight xl:text-6xl">
                Gestiona tu restaurante
                <span className="block text-orange-400">
                  de forma inteligente.
                </span>
              </h2>

              <p className="mt-6 max-w-lg text-lg leading-relaxed text-white/60">
                Controla ventas, mesas, inventario, productos,
                clientes y mucho más desde una sola plataforma.
              </p>

              {/* CARACTERÍSTICAS */}
              <div className="mt-10 grid grid-cols-2 gap-4">

                <Feature
                  icon="📊"
                  title="Ventas"
                  description="Control total"
                />

                <Feature
                  icon="📦"
                  title="Inventario"
                  description="Stock en tiempo real"
                />

                <Feature
                  icon="🍽️"
                  title="Mesas"
                  description="Gestión inteligente"
                />

                <Feature
                  icon="📈"
                  title="Reportes"
                  description="Datos para decidir"
                />

              </div>
            </div>

            {/* FOOTER */}
            <p className="text-sm text-white/30">
              © 2026 RestPro. Todos los derechos reservados.
            </p>
          </div>
        </section>

        {/* PANEL DERECHO */}
        <section className="relative flex min-h-screen items-center justify-center px-6 py-12">

          {/* Fondo */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#111111] via-[#080808] to-[#15100a]" />

          <div className="absolute inset-0 opacity-30">
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/20 blur-[120px]" />
          </div>

          {/* LOGIN */}
          <motion.div
            initial={{
              opacity: 0,
              y: 30,
              scale: 0.96,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            transition={{
              duration: 0.7,
              ease: "easeOut",
            }}
            className="relative z-10 w-full max-w-md"
          >
            <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl shadow-black/50 backdrop-blur-2xl">

              {/* LOGO MOBILE */}
              <div className="mb-8 lg:hidden">
                <div className="flex items-center gap-3">

                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500">
                    🍴
                  </div>

                  <div>
                    <h1 className="text-xl font-bold">
                      Rest<span className="text-orange-400">Pro</span>
                    </h1>
                  </div>

                </div>
              </div>

              {/* HEADER */}
              <div className="mb-8">
                <h2 className="text-3xl font-bold">
                  Bienvenido
                </h2>

                <p className="mt-2 text-white/50">
                  Ingresa a tu cuenta para continuar.
                </p>
              </div>

              {/* FORM */}
              <form className="space-y-5">

                {/* EMAIL */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Correo electrónico
                  </label>

                  <input
                    type="email"
                    placeholder="correo@empresa.com"
                    className="
                      w-full
                      rounded-xl
                      border border-white/10
                      bg-black/30
                      px-4
                      py-3
                      text-white
                      outline-none
                      transition
                      placeholder:text-white/25
                      focus:border-orange-400
                      focus:ring-2
                      focus:ring-orange-400/20
                    "
                  />
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/80">
                    Contraseña
                  </label>

                  <input
                    type="password"
                    placeholder="••••••••"
                    className="
                      w-full
                      rounded-xl
                      border border-white/10
                      bg-black/30
                      px-4
                      py-3
                      text-white
                      outline-none
                      transition
                      placeholder:text-white/25
                      focus:border-orange-400
                      focus:ring-2
                      focus:ring-orange-400/20
                    "
                  />
                </div>

                {/* RECORDAR */}
                <div className="flex items-center justify-between text-sm">

                  <label className="flex items-center gap-2 text-white/50">
                    <input
                      type="checkbox"
                      className="accent-orange-500"
                    />

                    Recordarme
                  </label>

                  <button
                    type="button"
                    className="text-orange-400 transition hover:text-orange-300"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>

                </div>

                {/* BOTÓN */}
                <motion.button
                  type="submit"
                  whileHover={{
                    scale: 1.02,
                  }}
                  whileTap={{
                    scale: 0.98,
                  }}
                  className="
                    w-full
                    rounded-xl
                    bg-orange-500
                    px-4
                    py-3.5
                    font-semibold
                    text-black
                    shadow-lg
                    shadow-orange-500/20
                    transition
                    hover:bg-orange-400
                  "
                >
                  Iniciar sesión
                </motion.button>

              </form>

              {/* REGISTRO */}
              <p className="mt-8 text-center text-sm text-white/40">
                ¿Todavía no tienes una cuenta?{" "}
                <button
                  type="button"
                  className="font-medium text-orange-400"
                >
                  Regístrate
                </button>
              </p>

            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{
        y: -4,
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md"
    >
      <div className="mb-3 text-2xl">
        {icon}
      </div>

      <p className="font-semibold">
        {title}
      </p>

      <p className="mt-1 text-sm text-white/40">
        {description}
      </p>
    </motion.div>
  );
}