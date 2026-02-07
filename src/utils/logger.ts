import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      const levelEmoji: Record<string, string> = {
        error: '❌',
        warn: '⚠️',
        info: 'ℹ️',
        debug: '🔍',
      };
      const emoji = levelEmoji[level] || 'ℹ️';
      const msg = `[${timestamp}] ${emoji} [${level.toUpperCase()}] ${message}`;
      return stack ? `${msg}\n${stack}` : msg;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'combined.log',
      maxsize: 5242880,
      maxFiles: 5
    })
  ],
});
