import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Empresa } from '../empresa/empresa.entity';
import { Rol } from '../roles/rol.entity';
import { Personal } from '../personal/personal.entity';

@Entity('usuarios')
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Empresa dueña de esta fila. Es la columna sobre la que actúan las políticas RLS de
   * Postgres: sin ella, una consulta de la Empresa A podría alcanzar filas de la B. Ver
   * `database/tenant-context.ts`. */
  @ManyToOne(() => Empresa, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'empresa_id' })
  empresa!: Empresa;

  @OneToOne(() => Personal, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'personal_id' })
  personal!: Personal;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 150, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /**
   * Marca al proveedor del sistema (quien lo vende y lo opera), no a un usuario del
   * restaurante. Habilita el panel transversal de `/api/plataforma`, que es el único lugar
   * del sistema que mira todas las empresas a la vez.
   *
   * **No se puede activar por la API**: solo por `proveedor-bootstrap.service.ts` (usado por
   * `scripts/cli-proveedor.ts`, H01) o por migración. Si fuera editable desde
   * `PUT /api/usuarios/:id`, el administrador de cualquier restaurante podría ascenderse a
   * proveedor y leer los datos de todos los demás — exactamente lo que el aislamiento existe
   * para impedir.
   */
  @Column({ name: 'es_proveedor', type: 'boolean', default: false })
  esProveedor!: boolean;

  /**
   * Fuerza la rotación de la contraseña antes de permitir cualquier otra operación (H01).
   *
   * La pone en `true` la migración de arranque cuando detecta que la contraseña sigue siendo
   * el placeholder público de `SeedRbacInicial`, y la propia aplicación al cambiar una
   * contraseña la vuelve a poner en `false`. Mientras esté en `true`, `requireAuth`
   * (`middlewares/auth.middleware.ts`) bloquea toda ruta salvo las del propio flujo de
   * cambio de contraseña.
   */
  @Column({ name: 'debe_cambiar_password', type: 'boolean', default: false })
  debeCambiarPassword!: boolean;

  @ManyToOne(() => Rol, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'rol_id' })
  rol!: Rol;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn!: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn!: Date;
}
