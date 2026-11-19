import env from './config/env.js';
import { sequelize } from './models/index.js';
import app from './app.js';

let server;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.info(`MySQL connected (${env.db.host}:${env.db.port}/${env.db.name})`);

    server = app.listen(env.port, () => {
      console.info(`user-backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
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
