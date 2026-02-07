import crypto from 'crypto';

/**
 * Genera un hash SHA-256 a partir de un buffer de datos
 */
export function generateHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Genera un hash SHA-256 a partir de una cadena de texto
 */
export function generateHashFromString(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Genera un hash combinado de imagen + contexto
 * Esto permite cachear la misma imagen con diferentes preguntas
 */
export function generateContextualHash(imageData: Buffer, context: string): string {
  const imageHash = generateHash(imageData);
  const contextHash = generateHashFromString(context);
  // Combinar ambos hashes
  return crypto.createHash('sha256').update(imageHash + contextHash, 'utf8').digest('hex');
}
