import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import * as catalogosController from './catalogos.controller';

export const catalogosRouter = Router();

catalogosRouter.use(requireAuth);
catalogosRouter.get('/tipos-documento-identidad', catalogosController.tiposDocumentoIdentidad);
catalogosRouter.get('/tipos-comprobante', catalogosController.tiposComprobante);
