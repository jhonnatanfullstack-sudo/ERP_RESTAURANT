import { motion } from 'framer-motion';

const EASE_PREMIUM = [0.4, 0, 0.2, 1] as const;

/** Envoltorio que entra con un fundido + ascenso al hacer scroll hasta él — personalidad
 * "Premium" de la skill de motion design, reusado en toda la carta pública para no repetir
 * las mismas variantes en cada sección. */
export function SeccionRevelada({
  children,
  className = '',
  retraso = 0,
}: {
  children: React.ReactNode;
  className?: string;
  /** Para escalonar varios elementos del mismo bloque (en segundos). */
  retraso?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.5, ease: EASE_PREMIUM, delay: retraso }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
