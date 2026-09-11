import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Almacen } from '../almacenes/almacen.entity';
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { TalonarioUsuario } from './talonario-usuario.entity';

/**
 * Serie autorizada de comprobantes (talonario) desde la que se numeran las ventas: una serie
 * SUNAT de 4 caracteres (B001, F001, …) con su correlativo vigente y el rango que puede
 * recorrer. Reemplaza la serie fija por tipo de comprobante que traía `venta.service.ts`, y
 * permite tener varias series simultáneas — una por caja/punto de emisión — asignadas a los
 * usuarios que emiten desde cada una (`TalonarioUsuario`).
 *
 * `numeroActual` es el ÚLTIMO número emitido, no el siguiente: el siguiente comprobante se
 * numera con `max(numeroActual + 1, numeroInicio)`. Así un talonario recién creado con
 * `numeroActual = 0` arranca en `numeroInicio`, y uno que continúa un talonario físico
 * arranca donde quedó el anterior sin necesitar un campo aparte.
 */
@Entity('talonarios')
// La serie identifica al talonario dentro de la empresa: no puede repetirse (dos talonarios
// con la misma serie producirían dos veces el mismo número de comprobante).
@Index('IDX_un_talonario_por_empresa_serie', ['empresa', 'serie'], { unique: true })
export class Talonario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @ManyToOne(() => TipoComprobante, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante;

  /** Punto de emisión al que pertenece la serie (caja, barra, almacén principal…). */
  @ManyToOne(() => Almacen, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'almacen_id' })
  almacen!: Almacen;

  /** 4 caracteres, con la letra que SUNAT exige según el comprobante: B para boleta, F para
   * factura (ver `talonario.service.ts: validarSerie`). Mismo largo que `ventas.serie`. */
  @Column({ type: 'varchar', length: 4 })
  serie!: string;

  /** Último número emitido con esta serie. 0 = ninguno todavía. */
  @Column({ name: 'numero_actual', type: 'integer', default: 0 })
  numeroActual!: number;

  /** Primer número del rango autorizado. */
  @Column({ name: 'numero_inicio', type: 'integer', default: 1 })
  numeroInicio!: number;

  /** Último número del rango autorizado; al alcanzarlo el talonario se agota. */
  @Column({ name: 'numero_fin', type: 'integer', default: 99999999 })
  numeroFin!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @OneToMany(() => TalonarioUsuario, (asignacion) => asignacion.talonario)
  usuarios!: TalonarioUsuario[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
