import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';

/**
 * Parámetros operativos del restaurante (FASE 21).
 *
 * Recoge lo que hasta ahora eran **constantes fijas en el código** y que cada restaurante
 * razonablemente quiere distinto: cuánto dura una reserva, a cuántos días vende al crédito,
 * cada cuánto se refresca la pantalla de cocina, qué food cost considera sano. Que estuvieran
 * escritas en el código no era un problema mientras el sistema servía a un solo local; con
 * varios restaurantes es directamente incorrecto, porque una cevichería y una pollería no
 * tienen los mismos números.
 *
 * **No es una tabla clave-valor.** Un `configuraciones(clave, valor)` sería más flexible pero
 * pierde el tipo, la validación y el valor por defecto: nada impediría guardar
 * `dias_credito = "treinta"`. Con columnas tipadas, Postgres y zod validan por su cuenta.
 *
 * **Una fila por empresa, creada al guardar por primera vez.** Leer no crea nada: si todavía
 * no hay fila, el service devuelve los valores por defecto sin escribir — una petición GET no
 * debería tener efectos secundarios.
 */
@Entity('configuraciones')
@Index(['empresa'], { unique: true })
export class Configuracion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  // --- Operación ---------------------------------------------------------------------

  /** Duración por defecto de una reserva cuando no se indica otra. Define además la ventana
   * que bloquea la mesa para detectar solapamientos. */
  @Column({ name: 'duracion_reserva_minutos', type: 'smallint', default: 90 })
  duracionReservaMinutos!: number;

  /** Cada cuántos segundos la pantalla de cocina vuelve a pedir la cola de comandas. Un
   * local con mucho movimiento lo querrá más corto; uno tranquilo, más largo, para no
   * consultar al servidor sin necesidad. */
  @Column({ name: 'segundos_refresco_cocina', type: 'smallint', default: 8 })
  segundosRefrescoCocina!: number;

  // --- Ventas ------------------------------------------------------------------------

  /** Días de plazo de una venta al crédito cuando no se pacta una fecha concreta. */
  @Column({ name: 'dias_credito_por_defecto', type: 'smallint', default: 30 })
  diasCreditoPorDefecto!: number;

  // --- Costos ------------------------------------------------------------------------

  /** Hasta qué porcentaje de food cost un plato se considera sano (verde en `/costos`). */
  @Column({ name: 'food_cost_objetivo', type: 'smallint', default: 35 })
  foodCostObjetivo!: number;

  /** A partir de qué porcentaje el margen se considera crítico (rojo en `/costos`). */
  @Column({ name: 'food_cost_critico', type: 'smallint', default: 50 })
  foodCostCritico!: number;

  // --- Carta pública -----------------------------------------------------------------
  // Estos campos sí se exponen sin autenticación: son lo que el restaurante quiere que su
  // cliente vea junto al menú.

  @Column({ name: 'horario_atencion', type: 'varchar', length: 255, nullable: true })
  horarioAtencion!: string | null;

  @Column({ name: 'mensaje_bienvenida', type: 'varchar', length: 500, nullable: true })
  mensajeBienvenida!: string | null;

  /** Si la carta ofrece armar un pedido y enviarlo por WhatsApp. Un local que solo atiende en
   * salón puede querer publicar el menú sin invitar a pedir. */
  @Column({ name: 'acepta_pedidos_whatsapp', type: 'boolean', default: true })
  aceptaPedidosWhatsapp!: boolean;

  @Column({ name: 'facebook_url', type: 'varchar', length: 255, nullable: true })
  facebookUrl!: string | null;

  @Column({ name: 'instagram_url', type: 'varchar', length: 255, nullable: true })
  instagramUrl!: string | null;

  @Column({ name: 'tiktok_url', type: 'varchar', length: 255, nullable: true })
  tiktokUrl!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
