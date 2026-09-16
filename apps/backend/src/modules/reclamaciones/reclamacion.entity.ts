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
import { Usuario } from '../usuarios/usuario.entity';
import { TipoDocumentoIdentidad } from '../catalogos/tipo-documento-identidad.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

/** Un reclamo es una disconformidad relacionada al producto/servicio; una queja es sobre la
 * atención u otro malestar que no tiene que ver con lo comprado. Distinción del propio
 * formato oficial de INDECOPI (D.S. 101-2022-PCM), no una categoría inventada acá. */
export enum TipoReclamacion {
  RECLAMO = 'reclamo',
  QUEJA = 'queja',
}

export enum EstadoReclamacion {
  PENDIENTE = 'pendiente',
  ATENDIDO = 'atendido',
}

/**
 * Libro de Reclamaciones Virtual: todo negocio que atiende público en Perú debe tener uno,
 * físico o virtual, accesible sin exigirle al consumidor ser cliente ni tener boleta (Ley
 * 29571 y su reglamento). Se llena desde la carta pública, sin autenticarse — mismo criterio
 * que `pedido.service.ts: crearPedidoPublico` — y el negocio tiene 30 días calendario para
 * responder (ver `respuestaProveedor`/`fechaRespuesta`), aunque el sistema no fuerza ese plazo:
 * es una obligación legal del negocio, no una regla que el software deba bloquear.
 */
@Entity('reclamaciones')
@Index('IDX_un_correlativo_reclamacion_por_empresa', ['empresa', 'numero'], { unique: true })
export class Reclamacion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** Correlativo simple por empresa (sin serie ni talonario: el formato oficial solo pide un
   * número que identifique el reclamo, no un comprobante SUNAT). */
  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'enum', enum: TipoReclamacion })
  tipo!: TipoReclamacion;

  // --- Datos del consumidor (obligatorios en el formato oficial) ------------------------

  @Column({ name: 'consumidor_nombres', type: 'varchar', length: 150 })
  consumidorNombres!: string;

  @Column({ name: 'consumidor_apellidos', type: 'varchar', length: 150 })
  consumidorApellidos!: string;

  @ManyToOne(() => TipoDocumentoIdentidad, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_documento_identidad_id' })
  tipoDocumentoIdentidad!: TipoDocumentoIdentidad;

  @Column({ name: 'consumidor_numero_documento', type: 'varchar', length: 15 })
  consumidorNumeroDocumento!: string;

  @Column({ name: 'consumidor_domicilio', type: 'varchar', length: 255 })
  consumidorDomicilio!: string;

  @Column({ name: 'consumidor_email', type: 'varchar', length: 150 })
  consumidorEmail!: string;

  @Column({ name: 'consumidor_telefono', type: 'varchar', length: 20, nullable: true })
  consumidorTelefono!: string | null;

  /** Si el consumidor es menor de edad, el formato exige los datos de su padre/madre o
   * apoderado en vez de —o además de— los suyos. */
  @Column({ name: 'es_menor_edad', type: 'boolean', default: false })
  esMenorEdad!: boolean;

  @Column({ name: 'apoderado_nombre', type: 'varchar', length: 150, nullable: true })
  apoderadoNombre!: string | null;

  @Column({ name: 'apoderado_numero_documento', type: 'varchar', length: 15, nullable: true })
  apoderadoNumeroDocumento!: string | null;

  // --- Detalle del reclamo/queja ---------------------------------------------------------

  /** El bien o servicio contratado (ej. "Ají de gallina", "Atención en mesa"). Texto libre:
   * no siempre hay una `Venta`/`Pedido` de por medio que lo respalde. */
  @Column({ name: 'descripcion_bien', type: 'varchar', length: 255 })
  descripcionBien!: string;

  @Column({
    name: 'monto_reclamado',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  montoReclamado!: number | null;

  @Column({ type: 'text' })
  detalle!: string;

  /** Qué pide el consumidor como solución (devolución, cambio, disculpas...). */
  @Column({ type: 'text' })
  pedido!: string;

  // --- Respuesta del negocio ---------------------------------------------------------------

  @Column({ type: 'enum', enum: EstadoReclamacion, default: EstadoReclamacion.PENDIENTE })
  estado!: EstadoReclamacion;

  @Column({ name: 'respuesta_proveedor', type: 'text', nullable: true })
  respuestaProveedor!: string | null;

  @Column({ name: 'fecha_respuesta', type: 'timestamptz', nullable: true })
  fechaRespuesta!: Date | null;

  @ManyToOne(() => Usuario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'usuario_atendio_id' })
  usuarioAtendio!: Usuario | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
