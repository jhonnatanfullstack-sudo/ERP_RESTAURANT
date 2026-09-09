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
 * Ubicación física donde se guarda mercadería/insumos (ej. "Almacén principal", "Cocina",
 * "Barra") — toda `Existencia` ocurre en un almacén. Pertenece a una `Empresa`: aunque hoy el
 * sistema es de un solo local (sección 1 de `CLAUDE.md`), un local puede tener más de un
 * almacén físico, y la FK deja la puerta abierta a multi-sucursal sin rediseñar nada.
 */
@Entity('almacenes')
// Un solo almacén puede ser "principal" por empresa: el destino/origen por defecto de los
// movimientos automáticos (consumo de cocina, venta directa) cuando no se elige uno a mano.
@Index('IDX_un_almacen_principal_por_empresa', ['empresa'], {
  unique: true,
  where: `"es_principal" = true`,
})
export class Almacen {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  direccion!: string | null;

  @Column({ name: 'es_principal', type: 'boolean', default: false })
  esPrincipal!: boolean;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
