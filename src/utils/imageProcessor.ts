import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { logger } from './logger';
import { getErrorMessage } from './error';

export interface ProcessedImage {
  data: Buffer;
  mimeType: string;
  source: 'base64' | 'url' | 'file';
}

/**
 * Procesa una imagen desde diferentes fuentes (base64, URL, path local)
 */
export async function processImage(imageSource: string): Promise<ProcessedImage> {
  // Caso 1: Base64
  if (imageSource.startsWith('data:image/')) {
    logger.debug('Procesando imagen desde base64');
    
    // Regex mejorada para capturar MIME types con parámetros (ej: image/png;charset=utf-8)
    const matches = imageSource.match(/^data:(image\/[^;]+)(?:;([^;]+))?;base64,(.+)$/);
    if (!matches) {
      // Intentar regex más simple para compatibilidad
      const simpleMatches = imageSource.match(/^data:(image\/[^,]+),base64,(.+)$/);
      if (!simpleMatches) {
        throw new Error('Formato base64 inválido');
      }
      const [, mimeType, base64Data] = simpleMatches;
      return {
        data: Buffer.from(base64Data, 'base64'),
        mimeType: mimeType.split(';')[0], // Remover parámetros si existen
        source: 'base64',
      };
    }
    
    const [, mimeType, , base64Data] = matches;
    return {
      data: Buffer.from(base64Data, 'base64'),
      mimeType: mimeType.split(';')[0], // Remover parámetros si existen
      source: 'base64',
    };
  }

  // Caso 2: URL
  if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
    logger.debug(`Descargando imagen desde URL: ${imageSource}`);
    try {
      const response = await axios.get(imageSource, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024,
      });
      
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      
      return {
        data: Buffer.from(response.data),
        mimeType,
        source: 'url',
      };
    } catch (error: unknown) {
      logger.error(`Error descargando imagen: ${getErrorMessage(error)}`);
      throw new Error(`No se pudo descargar la imagen: ${getErrorMessage(error)}`);
    }
  }

  // Caso 3: Path local
  logger.debug(`Leyendo imagen desde path local: ${imageSource}`);
  try {
    const absolutePath = path.resolve(imageSource);
    const data = await fs.readFile(absolutePath);
    
    // Detectar MIME type por extensión
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };
    const mimeType = mimeTypes[ext] || 'image/jpeg';
    
    return {
      data,
      mimeType,
      source: 'file',
    };
  } catch (error: unknown) {
    logger.error(`Error leyendo imagen local: ${getErrorMessage(error)}`);
    throw new Error(`No se pudo leer la imagen: ${getErrorMessage(error)}`);
  }
}

/**
 * Valida el tamaño del archivo (imágenes, PDFs, audio, video, etc.)
 */
export function validateFileSize(data: Buffer): void {
  const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '50') * 1024 * 1024;
  if (data.length > maxSize) {
    throw new Error(
      `Archivo demasiado grande: ${(data.length / 1024 / 1024).toFixed(2)}MB (máximo: ${process.env.MAX_FILE_SIZE_MB || '50'}MB)`
    );
  }
}
