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

/** OSE (Operador de Servicios Electrónicos) que tramita el envío a SUNAT. Ampliable sin tocar
 * el resto del módulo — el service resuelve la implementación según este código. */
export enum ProveedorOse {
  NUBEFACT = 'nubefact',
}

export enum AmbienteFacturacion {
  /** SUNAT beta / demo del OSE: no tiene validez tributaria, sirve para probar el circuito
   * completo antes de emitir comprobantes reales. */
  BETA = 'beta',
  PRODUCCION = 'produccion',
}

/**
 * Certificado digital y credenciales del OSE de una empresa (FASE 28), una fila por empresa
 * (mismo patrón que `Configuracion` de FASE 21).
 *
 * **Por qué una tabla propia y no columnas en `Configuracion`.** Guarda material criptográfico
 * (clave privada del certificado, credencial del OSE) que se cifra en reposo
 * (`utils/cifrado.ts`) y que en el futuro puede necesitar auditoría/rotación propia — mezclarlo
 * con horarios de atención y umbrales de food cost habría sido acoplar dos cosas que cambian
 * por razones completamente distintas.
 *
 * **`activo` es un interruptor explícito**, separado de si hay certificado/credencial
 * cargados: permite terminar de configurar sin que una venta dispare un envío real a mitad de
 * la carga de datos.
 */
@Entity('configuraciones_facturacion')
@Index(['empresa'], { unique: true })
export class ConfiguracionFacturacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ name: 'ose_proveedor', type: 'enum', enum: ProveedorOse, nullable: true })
  oseProveedor!: ProveedorOse | null;

  @Column({ name: 'ose_usuario', type: 'varchar', length: 100, nullable: true })
  oseUsuario!: string | null;

  /** Contraseña/token del OSE, cifrada (`utils/cifrado.ts`) — nunca en texto plano. */
  @Column({ name: 'ose_credencial_cifrada', type: 'bytea', nullable: true })
  oseCredencialCifrada!: Buffer | null;

  /** Certificado `.pfx`/`.p12` completo, cifrado. */
  @Column({ name: 'certificado_pfx_cifrado', type: 'bytea', nullable: true })
  certificadoPfxCifrado!: Buffer | null;

  /** Contraseña del `.pfx`, cifrada. */
  @Column({ name: 'certificado_contrasena_cifrada', type: 'bytea', nullable: true })
  certificadoContrasenaCifrada!: Buffer | null;

  @Column({ name: 'certificado_valido_hasta', type: 'date', nullable: true })
  certificadoValidoHasta!: string | null;

  @Column({
    type: 'enum',
    enum: AmbienteFacturacion,
    default: AmbienteFacturacion.BETA,
  })
  ambiente!: AmbienteFacturacion;

  @Column({ type: 'boolean', default: false })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
