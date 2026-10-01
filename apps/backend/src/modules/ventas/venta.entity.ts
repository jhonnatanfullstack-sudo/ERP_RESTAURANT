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
import { Pedido } from '../pedidos/pedido.entity';
import { Cliente } from '../clientes/cliente.entity';
import { TipoComprobante } from '../catalogos/tipo-comprobante.entity';
import { TipoOperacion } from '../catalogos/tipo-operacion.entity';
import { MedioPago } from '../catalogos/medio-pago.entity';
import { DetalleVenta } from './detalle-venta.entity';
import { Talonario } from '../talonario/talonario.entity';
import { Banco } from '../catalogos/banco.entity';
import { numericTransformer } from '../../utils/numeric-transformer';

export enum FormaPago {
  CONTADO = 'contado',
  CREDITO = 'credito',
}

export enum EstadoVenta {
  EMITIDA = 'emitida',
  ANULADA = 'anulada',
}

@Entity('ventas')
@Index(['pedido'], { unique: true })
// Nombre explícito (y no el autogenerado por TypeORM): `venta.service.ts` distingue por él
// una colisión de correlativo de cualquier otra violación de unicidad, para reintentar solo
// en ese caso. Ver `esColisionDeCorrelativo`.
@Index('IDX_un_correlativo_por_serie', ['empresa', 'tipoComprobante', 'serie', 'numero'], {
  unique: true,
})
export class Venta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  /** null en una venta directa (sin pedido de origen) — ver venta.service.ts: crearVenta.
   * El índice único de abajo sigue impidiendo dos ventas del mismo pedido: Postgres no
   * considera iguales dos NULL en una columna UNIQUE, así que admite cualquier cantidad
   * de ventas directas sin necesitar un índice parcial. */
  @ManyToOne(() => Pedido, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id' })
  pedido!: Pedido | null;

  @ManyToOne(() => Cliente, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente | null;

  @ManyToOne(() => TipoComprobante, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_comprobante_id' })
  tipoComprobante!: TipoComprobante;

  /** Talonario del que salió `serie`/`numero`. Nullable: las ventas emitidas antes de existir
   * el módulo de talonarios (serie fija por tipo de comprobante) no tienen ninguno. */
  @ManyToOne(() => Talonario, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'talonario_id' })
  talonario!: Talonario | null;

  @Column({ type: 'varchar', length: 4 })
  serie!: string;

  @Column({ type: 'int' })
  numero!: number;

  @ManyToOne(() => TipoOperacion, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tipo_operacion_id' })
  tipoOperacion!: TipoOperacion;

  @Column({ name: 'forma_pago', type: 'enum', enum: FormaPago, default: FormaPago.CONTADO })
  formaPago!: FormaPago;

  @ManyToOne(() => MedioPago, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'medio_pago_id' })
  medioPago!: MedioPago | null;

  /** Entidad financiera del cobro al contado, cuando el medio de pago es bancarizado
   * (depósito, transferencia, cheque). En una venta al crédito el banco va en cada
   * `PagoVenta`, no aquí: el dinero entra después y puede entrar por varias vías. */
  @ManyToOne(() => Banco, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'banco_id' })
  banco!: Banco | null;

  /** Número de operación/voucher del cobro al contado bancarizado. */
  @Column({ name: 'numero_operacion', type: 'varchar', length: 50, nullable: true })
  numeroOperacion!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  igv!: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  total!: number;

  /** Propina voluntaria del cliente. No es parte del precio de venta ni paga IGV —queda fuera
   * de `subtotal`/`igv`/`total` a propósito, así el comprobante SUNAT (`ubl/factura.builder`)
   * sigue reflejando solo lo vendido— pero si se cobró en efectivo sí es plata física que
   * entra a la caja (ver `caja.service.ts: calcularVentasEfectivo`). */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  propina!: number;

  /** Tipo de cambio USD/PEN (venta) publicado por SUNAT en la fecha de emisión, solo de
   * referencia contable — esta venta siempre se cobra en soles. Nullable: si la consulta al
   * proveedor externo falla, la venta igual se registra (ver tipo-cambio.service.ts). */
  @Column({
    name: 'tipo_cambio',
    type: 'numeric',
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: numericTransformer,
  })
  tipoCambio!: number | null;

  @Column({ type: 'enum', enum: EstadoVenta, default: EstadoVenta.EMITIDA })
  estado!: EstadoVenta;

  /**
   * H16 — marca si esta venta tiene snapshot fiscal propio (Empresa/Cliente congelados al
   * momento de crearla) o no. `null` en toda venta creada ANTES de esta migración ("legacy"):
   * su dato histórico real ya no es reconstruible, así que no se le asigna `1` con un backfill
   * que fingiría un histórico que no existe (ver `venta.service.ts`/`facturacion.service.ts`).
   * `1` en toda venta creada a partir de este contrato: sus columnas `snapshotEmpresa*`/
   * `snapshotCliente*` de abajo son la única fuente válida para facturarla, nunca la relación
   * viva `empresa`/`cliente`. No se deriva de si alguna columna snapshot es `null`, porque
   * varios campos (`nombreComercial`, `direccionFiscal`, todo `Cliente`) son legítimamente
   * opcionales incluso en una venta con contrato H16 completo.
   *
   * Solo `null` o `1` son valores válidos — la migración agrega un `CHECK` de Postgres que lo
   * exige (H16D-03, revisión Codex), y `facturacion.service.ts` lo vuelve a exigir
   * explícitamente antes de emitir (fail-closed, no confía únicamente en el `CHECK`): cualquier
   * otro valor nunca debe tratarse como legacy.
   */
  @Column({ name: 'snapshot_fiscal_version', type: 'smallint', nullable: true })
  snapshotFiscalVersion!: number | null;

  /** Snapshot de `Empresa` al momento de crear la venta (H16) — mismos 5 campos que
   * `factura.builder.ts` consume hoy de la relación viva (`ruc`, `razonSocial`,
   * `nombreComercial`, `ubigeo`, `direccionFiscal`). `ruc`/`razonSocial` son obligatorios en
   * `Empresa` misma, pero la columna sigue siendo nullable acá porque toda venta legacy
   * (`snapshotFiscalVersion = null`) no tiene ninguno de estos valores. */
  @Column({ name: 'snapshot_empresa_ruc', type: 'varchar', length: 11, nullable: true })
  snapshotEmpresaRuc!: string | null;

  @Column({
    name: 'snapshot_empresa_razon_social',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  snapshotEmpresaRazonSocial!: string | null;

  @Column({
    name: 'snapshot_empresa_nombre_comercial',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  snapshotEmpresaNombreComercial!: string | null;

  @Column({ name: 'snapshot_empresa_ubigeo', type: 'varchar', length: 255, nullable: true })
  snapshotEmpresaUbigeo!: string | null;

  @Column({
    name: 'snapshot_empresa_direccion_fiscal',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  snapshotEmpresaDireccionFiscal!: string | null;

  /** Snapshot de `Cliente` al momento de crear la venta (H16) — mismos 5 campos que
   * `factura.builder.ts: construirCliente` consume hoy de la relación viva. Todos nullable
   * incluso con `snapshotFiscalVersion = 1`: una venta puede legítimamente no tener cliente
   * identificado (boleta a "CLIENTE VARIOS"), igual que hoy `venta.cliente` puede ser `null`. */
  @Column({
    name: 'snapshot_cliente_tipo_documento_codigo',
    type: 'varchar',
    length: 2,
    nullable: true,
  })
  snapshotClienteTipoDocumentoCodigo!: string | null;

  @Column({
    name: 'snapshot_cliente_numero_documento',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  snapshotClienteNumeroDocumento!: string | null;

  @Column({
    name: 'snapshot_cliente_razon_social',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  snapshotClienteRazonSocial!: string | null;

  @Column({ name: 'snapshot_cliente_nombres', type: 'varchar', length: 150, nullable: true })
  snapshotClienteNombres!: string | null;

  @Column({ name: 'snapshot_cliente_apellidos', type: 'varchar', length: 150, nullable: true })
  snapshotClienteApellidos!: string | null;

  /** Tasa IGV EFECTIVA usada para calcular `subtotal`/`igv`/`total` de esta venta y cada
   * `DetalleVenta.igv` (H16D-01, revisión Codex) — nunca `Empresa.acogidoRegimenMypeRestaurantes`
   * (un booleano no basta para reconstruir el `<cbc:Percent>` del XML sin volver a derivar la
   * tasa desde la Empresa VIVA, que es justamente el problema que este snapshot evita). Mismo
   * criterio de nullabilidad que el resto: `null` en toda venta legacy. */
  @Column({
    name: 'snapshot_tasa_igv',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
    transformer: numericTransformer,
  })
  snapshotTasaIgv!: number | null;

  @OneToMany(() => DetalleVenta, (detalle) => detalle.venta)
  detalles!: DetalleVenta[];

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
