import type { ChatMessage, MessageContent } from "../types/openai";
import { logger } from "../utils/logger";
import { geminiService } from "../services/geminiService";
import { pdfProcessor } from "../utils/pdfProcessor";
import { getErrorMessage } from "../utils/error";
import {
  detectMultimodalContent,
  extractUserContext,
  getDeepseekSupportedContent,
  getGeminiRequiredContent,
  getLocalProcessingContent,
  type DetectedContent,
} from "./multimodalDetector";

/**
 * Procesa contenido multimodal y decide el routing
 */
export async function processMultimodalContent(
  messages: ChatMessage[],
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "gemini" | "local" | "mixed";
}> {
  // 1. Detectar contenido
  const analysis = await detectMultimodalContent(messages);

  if (analysis.hasOnlyText) {
    logger.debug("✓ Solo texto detectado - Passthrough directo a DeepSeek");
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  logger.info(
    `📊 Contenido detectado: ${analysis.detectedContent.length} elemento(s)`,
  );
  analysis.detectedContent.forEach((content, i) => {
    logger.info(
      `  → ${i + 1}. ${content.type} (${content.mimeType || "sin tipo"}): ${content.source.substring(0, 80)}...`,
    );
  });

  // 2. Separar contenido por destino
  const deepseekContent = getDeepseekSupportedContent(analysis.detectedContent);
  const geminiContent = await getGeminiRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  logger.info(`  → DeepSeek directo: ${deepseekContent.length} elemento(s)`);
  logger.info(`  → Gemini procesamiento: ${geminiContent.length} elemento(s)`);
  logger.info(`  → Procesamiento local: ${localContent.length} elemento(s)`);

  // 3. Si no hay contenido que procesar con Gemini ni localmente, usar DeepSeek directamente
  if (geminiContent.length === 0 && localContent.length === 0) {
    logger.info(
      "✓ Todo el contenido soportado por DeepSeek - Passthrough directo",
    );
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  // 4. Procesar contenido con Gemini y localmente
  const userContext = extractUserContext(messages);
  logger.debug(`Contexto del usuario: "${userContext.substring(0, 100)}..."`);

  const startTime = Date.now();

  // Procesar contenido con Gemini
  const geminiDescriptions = await Promise.all(
    geminiContent.map(async (content, index) => {
      logger.info(
        `🔍 Procesando ${content.type} ${index + 1}/${geminiContent.length} con Gemini...`,
      );
      try {
        return await geminiService.analyzeContent(content, userContext);
      } catch (error: unknown) {
        logger.error(
          `Error procesando ${content.type} ${index + 1} con Gemini: ${getErrorMessage(error)}`,
        );
        throw error;
      }
    }),
  );

  // Procesar contenido localmente (PDFs) con fallback a Gemini
  const localDescriptions = await Promise.all(
    localContent.map(async (content, index) => {
      logger.info(
        `📄 Procesando ${content.type} ${index + 1}/${localContent.length} localmente...`,
      );
      try {
        // Validar tamaño antes de descargar
        const { downloader } = await import("../utils/downloader");
        const validation = await downloader.validateFile(content.source);

        if (!validation.valid) {
          throw new Error(`Archivo no válido: ${validation.reason}`);
        }

        logger.info(
          `✓ Archivo validado: ${(validation.size! / 1024 / 1024).toFixed(2)}MB, ${validation.contentType}`,
        );

        // Descargar el PDF
        const { buffer } = await downloader.downloadFile(content.source);

        // Procesar localmente con el procesador de PDFs
        return await pdfProcessor.analyzePDF(buffer, userContext);
      } catch (error: unknown) {
        logger.error(
          `Error procesando ${content.type} ${index + 1} localmente: ${getErrorMessage(error)}`,
        );

        // Fallback a Gemini si el procesamiento local falla
        logger.info(
          `🔄 Fallback a Gemini para ${content.type} ${index + 1}...`,
        );
        try {
          const { geminiService } = await import("../services/geminiService");
          return await geminiService.analyzeContent(content, userContext);
        } catch (geminiError: unknown) {
          logger.error(
            `Fallback a Gemini también falló: ${getErrorMessage(geminiError)}`,
          );
          throw new Error(
            `Procesamiento local y fallback a Gemini fallaron: ${getErrorMessage(error)}`,
          );
        }
      }
    }),
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(
    `✓ ${geminiContent.length + localContent.length} elemento(s) procesado(s) en ${elapsed}s (${geminiContent.length} Gemini, ${localContent.length} local)`,
  );

  // 5. Reemplazar contenido procesado en los mensajes
  const processedMessages = JSON.parse(
    JSON.stringify(messages),
  ) as ChatMessage[];

  // Combinar todo el contenido procesado
  const allContent = [...geminiContent, ...localContent];
  const allDescriptions = [...geminiDescriptions, ...localDescriptions];

  for (let i = 0; i < allContent.length; i++) {
    const content = allContent[i];
    const description = allDescriptions[i];
    const message = processedMessages[content.messageIndex];

    if (Array.isArray(message.content) && content.contentIndex !== undefined) {
      const parts = message.content as MessageContent[];

      parts[content.contentIndex] = {
        type: "text",
        text: `[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`,
      };

      // Consolidar todas las partes de texto
      const textParts = parts
        .filter((part) => part.type === "text" && part.text)
        .map((part) => part.text)
        .join("\n\n");

      message.content =
        textParts ||
        `[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`;
    } else if (typeof message.content === "string") {
      message.content += `\n\n[DESCRIPCIÓN ${content.type.toUpperCase()} ${i + 1}]: ${description}`;
    }
  }

  // 6. Si hay contenido que DeepSeek puede manejar directamente, mantenerlo
  // (ya está en los mensajes originales)

  // Determine strategy
  let strategy: "direct" | "gemini" | "local" | "mixed" = "mixed";
  if (geminiContent.length > 0 && localContent.length === 0)
    strategy = "gemini";
  else if (geminiContent.length === 0 && localContent.length > 0)
    strategy = "local";

  return { processedMessages, useDeepseekDirectly: false, strategy };
}

/**
 * Determina si el contenido puede ser manejado directamente por DeepSeek
 * Ahora async para soportar detección de tamaño en PDFs
 */
export async function canDeepseekHandleDirectly(
  messages: ChatMessage[],
): Promise<boolean> {
  const analysis = await detectMultimodalContent(messages);

  if (analysis.hasOnlyText) return true;

  const geminiContent = await getGeminiRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  return geminiContent.length === 0 && localContent.length === 0;
}
