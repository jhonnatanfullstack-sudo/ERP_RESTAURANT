import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('empresas')
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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
