import { AppDataSource } from '../../database/data-source';
import { RefreshToken } from './refresh-token.entity';

export const refreshTokenRepository = AppDataSource.getRepository(RefreshToken);
