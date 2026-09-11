import { tenantRepository } from '../../database/tenant-repository';
import { RefreshToken } from './refresh-token.entity';

export const refreshTokenRepository = tenantRepository(RefreshToken);
