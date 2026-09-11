import { tenantRepository } from '../../database/tenant-repository';
import { RegistroAuditoria } from './registro-auditoria.entity';

export const registroAuditoriaRepository = tenantRepository(RegistroAuditoria);
