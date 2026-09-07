import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { empresaRouter } from '../modules/empresa/empresa.routes';
import { personalRouter } from '../modules/personal/personal.routes';
import { usuarioRouter } from '../modules/usuarios/usuario.routes';
import { rolRouter } from '../modules/roles/rol.routes';
import { permisoRouter } from '../modules/permisos/permiso.routes';
import { catalogosRouter } from '../modules/catalogos/catalogos.routes';
import { categoriaRouter } from '../modules/categorias/categoria.routes';
import { marcaRouter } from '../modules/marcas/marca.routes';
import { productoRouter } from '../modules/productos/producto.routes';
import { salonRouter } from '../modules/salones/salon.routes';
import { mesaRouter } from '../modules/mesas/mesa.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/empresas', empresaRouter);
apiRouter.use('/personal', personalRouter);
apiRouter.use('/usuarios', usuarioRouter);
apiRouter.use('/roles', rolRouter);
apiRouter.use('/permisos', permisoRouter);
apiRouter.use('/catalogos', catalogosRouter);
apiRouter.use('/categorias', categoriaRouter);
apiRouter.use('/marcas', marcaRouter);
apiRouter.use('/productos', productoRouter);
apiRouter.use('/salones', salonRouter);
apiRouter.use('/mesas', mesaRouter);
