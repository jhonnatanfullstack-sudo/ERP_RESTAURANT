import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { empresaRouter } from '../modules/empresa/empresa.routes';
import { personalRouter } from '../modules/personal/personal.routes';
import { usuarioRouter } from '../modules/usuarios/usuario.routes';
import { rolRouter } from '../modules/roles/rol.routes';
import { permisoRouter } from '../modules/permisos/permiso.routes';
import { catalogosRouter } from '../modules/catalogos/catalogos.routes';
import { categoriaRouter } from '../modules/categorias/categoria.routes';
import { productoRouter } from '../modules/productos/producto.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/empresas', empresaRouter);
apiRouter.use('/personal', personalRouter);
apiRouter.use('/usuarios', usuarioRouter);
apiRouter.use('/roles', rolRouter);
apiRouter.use('/permisos', permisoRouter);
apiRouter.use('/catalogos', catalogosRouter);
apiRouter.use('/categorias', categoriaRouter);
apiRouter.use('/productos', productoRouter);
