import { sequelize } from './models/index.js';
import { getJwtSecrets } from './services/token.service.js';
import { getOtpHmacSecret } from './services/auth.service.js';
import { getEmailConfig } from './services/email.service.js';
import app from './app.js';

let server;

async function startServer() {
  try {
    getJwtSecrets();
    getOtpHmacSecret();
    getEmailConfig();

    const dbHost = process.env.DB_HOST || '127.0.0.1';
    const dbPort = Number(process.env.DB_PORT || 3306);
    const dbName = process.env.DB_NAME || 'japaika_ecommerce';
    const port = Number(process.env.PORT || 5000);
    const nodeEnv = process.env.NODE_ENV || 'development';

    await sequelize.authenticate();
    console.info(`MySQL connected (${dbHost}:${dbPort}/${dbName})`);

    server = app.listen(port, () => {
      console.info(`user-backend listening on http://localhost:${port} (${nodeEnv})`);
    });
  } catch (err) {
    console.error('Failed to start user-backend:', err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.info(`Received ${signal}. Shutting down user-backend...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await sequelize.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();
