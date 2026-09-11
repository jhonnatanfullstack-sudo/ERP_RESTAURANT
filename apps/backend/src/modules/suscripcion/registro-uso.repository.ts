import { tenantRepository } from '../../database/tenant-repository';
import { RegistroUso } from './registro-uso.entity';

export const registroUsoRepository = tenantRepository(RegistroUso);
