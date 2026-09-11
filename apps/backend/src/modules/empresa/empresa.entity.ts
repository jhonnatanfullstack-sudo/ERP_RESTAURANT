import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Qué tipo de cuenta tiene la empresa dentro del sistema. */
export enum PlanEmpresa {
  /** Prueba gratuita con fecha de vencimiento (`demoExpiraEn`). */
  DEMO = 'demo',
  /** Cliente que contrató: sin vencimiento. */
  ACTIVO = 'activo',
}

@Entity('empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Identificador corto y legible de la empresa en URLs públicas: la carta se sirve en
   * `/carta/:slug`. No se usa el UUID porque este enlace lo comparte el restaurante con sus
   * clientes por WhatsApp, y `/carta/el-fogon` se lee y se dicta; un UUID no. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60, unique: true })
  slug!: string;

  @Column({ type: 'enum', enum: PlanEmpresa, default: PlanEmpresa.DEMO })
  plan!: PlanEmpresa;

  /** Cuándo vence la prueba. Solo aplica a `plan = demo`; `null` en una cuenta contratada.
   * El vencimiento se **deriva** de esta fecha en cada petición en vez de guardarse como un
   * estado que haya que ir actualizando: así no hace falta una tarea programada que marque
   * las demos vencidas cada noche, y no existe la ventana en la que una demo ya venció pero
   * el estado todavía dice lo contrario. */
  @Column({ name: 'demo_expira_en', type: 'timestamptz', nullable: true })
  demoExpiraEn!: Date | null;

  /** Suspensión manual por parte del proveedor (impago, abuso). Independiente del
   * vencimiento de la demo: una cuenta contratada también se puede suspender. */
  @Column({ type: 'boolean', default: false })
  suspendida!: boolean;

  /** Si nació del registro público de demo o la creó el proveedor a mano. Sirve para separar
   * en el panel las altas reales de las de prueba. */
  @Column({ name: 'creada_por_autoservicio', type: 'boolean', default: false })
  creadaPorAutoservicio!: boolean;

  @Column({ type: 'varchar', length: 11, unique: true })
  ruc!: string;

  @Column({ name: 'razon_social', type: 'varchar', length: 255 })
  razonSocial!: string;

  @Column({ name: 'nombre_comercial', type: 'varchar', length: 255, nullable: true })
  nombreComercial!: string | null;

  @Column({ name: 'direccion_fiscal', type: 'varchar', length: 255, nullable: true })
  direccionFiscal!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  telefono!: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email!: string | null;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ubigeo!: string | null;

  @Column({ type: 'text', nullable: true })
  logo!: string | null;

  /** Si la empresa se acogió al régimen especial de IGV para MYPE de restaurantes/hoteles
   * (10.5% en vez del 18% general, Ley N° 31940/32219/32387) — no es automático, requiere
   * acogimiento explícito ante SUNAT (Formulario Virtual 621), así que es un dato que cada
   * empresa declara aquí, no una constante del sistema. Ver `venta.service.ts` y
   * `decisiones-tecnicas.md`. */
  @Column({ name: 'acogido_regimen_mype_restaurantes', type: 'boolean', default: false })
  acogidoRegimenMypeRestaurantes!: boolean;
}
