import type { ChatMessage, MessageContent } from '../types/openai';
import { logger } from '../utils/logger';
import { geminiService } from '../services/geminiService';
import { getErrorMessage } from '../utils/error';

export interface DetectedImage {
  source: string;
  messageIndex: number;
  contentIndex?: number;
}

/**
 * Detecta si hay imágenes en los mensajes
 * SOLO detecta imágenes en el ÚLTIMO mensaje del usuario
 */
export function detectImages(messages: ChatMessage[]): DetectedImage[] {
  const images: DetectedImage[] = [];

  // Buscar el último mensaje del usuario (el mensaje actual)
  let lastUserMessageIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessageIndex = i;
      break;
    }
  }

  // Si no hay mensaje de usuario, no hay imágenes
  if (lastUserMessageIndex === -1) {
    return images;
  }

  // Solo procesar el último mensaje del usuario
  const message = messages[lastUserMessageIndex];
  
  if (!message.content) return images;

  // Caso 1: Contenido multipart con image_url
  if (Array.isArray(message.content)) {
    for (let j = 0; j < message.content.length; j++) {
      const part = message.content[j];
      if (part.type === 'image_url' && part.image_url?.url) {
        images.push({
          source: part.image_url.url,
          messageIndex: lastUserMessageIndex,
          contentIndex: j,
        });
      }
    }
  }

  // Caso 2: Base64 embebido en texto
  if (typeof message.content === 'string') {
    const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
    const matches = message.content.match(base64Regex);
    
    if (matches) {
      for (const match of matches) {
        images.push({
          source: match,
          messageIndex: lastUserMessageIndex,
        });
      }
    }
  }

  return images;
}

/**
 * Extrae el contexto textual del mensaje para pasarlo a Gemini
 */
function extractUserContext(messages: ChatMessage[]): string {
  // Buscar el último mensaje del usuario
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'user' && message.content) {
      if (typeof message.content === 'string') {
        return message.content;
      } else if (Array.isArray(message.content)) {
        // Extraer solo las partes de texto
        const textParts = message.content
          .filter(part => part.type === 'text' && part.text)
          .map(part => part.text)
          .join(' ');
        return textParts;
      }
    }
  }
  return '';
}

/**
 * Procesa las imágenes y reemplaza con descripciones
 */
export async function processImagesInMessages(messages: ChatMessage[]): Promise<ChatMessage[]> {
  const detectedImages = detectImages(messages);
  
  if (detectedImages.length === 0) {
    logger.debug('✓ No hay imágenes detectadas');
    return messages;
  }

  logger.info(`🖼️ ${detectedImages.length} imagen(es) detectada(s)`);

  // Verificar límite
  const maxImages = parseInt(process.env.MAX_IMAGES_PER_REQUEST || '999');
  if (detectedImages.length > maxImages) {
    throw new Error(`Demasiadas imágenes: ${detectedImages.length} (máximo: ${maxImages})`);
  }

  // Extraer contexto del usuario
  const userContext = extractUserContext(messages);
  logger.debug(`Contexto del usuario: "${userContext.substring(0, 100)}..."`);

  // Procesar todas las imágenes en paralelo
  const startTime = Date.now();
  
  const descriptions = await Promise.all(
    detectedImages.map(async (img, index) => {
      logger.info(`📸 Procesando imagen ${index + 1}/${detectedImages.length}...`);
      try {
        return await geminiService.analyzeImage(img.source, userContext);
      } catch (error: unknown) {
        logger.error(`Error procesando imagen ${index + 1}: ${getErrorMessage(error)}`);
        throw error;
      }
    })
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`✓ ${detectedImages.length} imagen(es) procesada(s) en ${elapsed}s`);

  // Clonar mensajes para no mutar el original
  const processedMessages = JSON.parse(JSON.stringify(messages)) as ChatMessage[];

  // Reemplazar imágenes con descripciones
  for (let i = 0; i < detectedImages.length; i++) {
    const img = detectedImages[i];
    const description = descriptions[i];
    const message = processedMessages[img.messageIndex];

    if (Array.isArray(message.content) && img.contentIndex !== undefined) {
      const parts = message.content as MessageContent[];
      
      parts[img.contentIndex] = {
        type: 'text',
        text: `[DESCRIPCIÓN IMAGEN ${i + 1}]: ${description}`,
      };
      
      const textParts = parts
        .filter(part => part.type === 'text' && part.text)
        .map(part => part.text)
        .join('\n\n');
      
      message.content = textParts || `[DESCRIPCIÓN IMAGEN ${i + 1}]: ${description}`;
      
    } else if (typeof message.content === 'string') {
      message.content += `\n\n[DESCRIPCIÓN IMAGEN ${i + 1}]: ${description}`;
    }
  }

  return processedMessages;
}
