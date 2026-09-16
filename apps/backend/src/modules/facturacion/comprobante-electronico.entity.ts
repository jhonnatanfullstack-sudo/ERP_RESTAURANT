import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Venta } from '../ventas/venta.entity';

/**
 * Estado del comprobante frente a SUNAT. No es el estado comercial de la `Venta` (esa puede
 * estar `emitida` y su comprobante seguir `pendiente` de envío): son dos ciclos de vida
 * distintos y mezclarlos impide reintentar un envío fallido sin tocar la venta.
 */
export enum EstadoComprobante {
  /** Generado y firmado, todavía no enviado. */
  PENDIENTE = 'pendiente',
  /** SUNAT respondió con un CDR de aceptación (código 0). */
  ACEPTADO = 'aceptado',
  /** Aceptado pero con observaciones (CDR con código 4000 o notas). El comprobante es
   * válido; las observaciones se guardan para corregir emisiones futuras. */
  OBSERVADO = 'observado',
  /** SUNAT rechazó el comprobante. Hay que corregir y emitir uno nuevo: un rechazado no se
   * "reenvía", porque para SUNAT nunca existió. */
  RECHAZADO = 'rechazado',
  /** El envío falló por causas ajenas al contenido (red, servicio caído, credenciales).
   * A diferencia de `rechazado`, este sí se reintenta con el mismo XML. */
  ERROR_ENVIO = 'error_envio',
}

/**
 * Representación electrónica de una `Venta` ante SUNAT: el XML UBL 2.1 firmado que se envió y
 * la constancia (CDR) que SUNAT devolvió.
 *
 * Vive en su propia tabla y no como columnas de `ventas` porque su ciclo de vida es
 * independiente (una venta registrada puede tardar en enviarse, fallar y reintentarse), y
 * porque el XML y el CDR son documentos con valor legal que deben conservarse tal cual se
 * intercambiaron, sin que un cambio en la venta los altere.
 */
@Entity('comprobantes_electronicos')
export class ComprobanteElectronico {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @OneToOne(() => Venta, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'venta_id' })
  venta!: Venta;

  /** Nombre normativo del archivo: `RUC-TIPO-SERIE-CORRELATIVO` (ej.
   * `20000000001-01-F001-123`). SUNAT lo exige así en el ZIP y en el XML. */
  @Column({ name: 'nombre_archivo', type: 'varchar', length: 60, unique: true })
  nombreArchivo!: string;

  @Column({ type: 'enum', enum: EstadoComprobante, default: EstadoComprobante.PENDIENTE })
  estado!: EstadoComprobante;

  /** XML UBL 2.1 ya firmado, tal cual se envió. Es el documento con valor legal. */
  @Column({ name: 'xml_firmado', type: 'text' })
  xmlFirmado!: string;

  /** DigestValue de la firma, que va impreso en la representación y en el código QR. */
  @Column({ name: 'hash_firma', type: 'varchar', length: 100 })
  hashFirma!: string;

  /** CDR devuelto por SUNAT (XML), la constancia de recepción. `null` mientras no se envía. */
  @Column({ name: 'cdr_xml', type: 'text', nullable: true })
  cdrXml!: string | null;

  /** Código de respuesta del CDR: `0` es aceptado, `2xxx`/`3xxx` rechazo, `4xxx` observación. */
  @Column({ name: 'codigo_respuesta', type: 'varchar', length: 10, nullable: true })
  codigoRespuesta!: string | null;

  @Column({ name: 'mensaje_respuesta', type: 'varchar', length: 500, nullable: true })
  mensajeRespuesta!: string | null;

  /** Cuántas veces se intentó enviar: permite distinguir un fallo puntual de uno persistente. */
  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ name: 'enviado_en', type: 'timestamptz', nullable: true })
  enviadoEn!: Date | null;

  /** Qué OSE tramitó el envío (ej. `nubefact`) — informativo/auditoría, no gobierna nada en
   * el código: el proveedor real se resuelve desde `ConfiguracionFacturacion` de la empresa. */
  @Column({ name: 'ose_proveedor', type: 'varchar', length: 20, nullable: true })
  oseProveedor!: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
