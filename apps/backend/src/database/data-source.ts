import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { env } from '../config/env';
import { Usuario } from '../modules/usuarios/usuario.entity';
import { Rol } from '../modules/roles/rol.entity';
import { Permiso } from '../modules/permisos/permiso.entity';
import { RefreshToken } from '../modules/auth/refresh-token.entity';
import { Empresa } from '../modules/empresa/empresa.entity';
import { Personal } from '../modules/personal/personal.entity';
import { TipoDocumentoIdentidad } from '../modules/catalogos/tipo-documento-identidad.entity';
import { TipoComprobante } from '../modules/catalogos/tipo-comprobante.entity';
import { Categoria } from '../modules/categorias/categoria.entity';
import { Producto } from '../modules/productos/producto.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  username: env.db.user,
  password: env.db.password,
  synchronize: false,
  logging: env.nodeEnv === 'development',
  entities: [
    Empresa,
    Personal,
    TipoDocumentoIdentidad,
    TipoComprobante,
    Usuario,
    Rol,
    Permiso,
    RefreshToken,
    Categoria,
    Producto,
  ],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
