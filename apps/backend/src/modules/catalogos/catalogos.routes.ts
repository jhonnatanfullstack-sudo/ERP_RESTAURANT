import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware';
import * as catalogosController from './catalogos.controller';

export const catalogosRouter = Router();

catalogosRouter.use(requireAuth);
catalogosRouter.get('/tipos-documento-identidad', catalogosController.tiposDocumentoIdentidad);
catalogosRouter.get('/tipos-comprobante', catalogosController.tiposComprobante);
catalogosRouter.get('/unidades-medida', catalogosController.unidadesMedida);
catalogosRouter.get('/tipos-afectacion-igv', catalogosController.tiposAfectacionIgv);
catalogosRouter.get('/tipos-operacion', catalogosController.tiposOperacion);
catalogosRouter.get('/medios-pago', catalogosController.mediosPago);
catalogosRouter.get('/bancos', catalogosController.bancos);
