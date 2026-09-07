import 'reflect-metadata';
import { AppDataSource } from './database/data-source';
import { app } from './app';
import { env } from './config/env';

async function bootstrap(): Promise<void> {
  await AppDataSource.initialize();
  console.log('Conexión a la base de datos establecida.');

  app.listen(env.port, () => {
    console.log(`Servidor escuchando en http://localhost:${env.port}`);
  });
}

bootstrap().catch((error: unknown) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});
