import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage } from "../types/openai";
import { logger } from "../utils/logger";
import { processImage, validateFileSize } from "../utils/imageProcessor";
import { generateContextualHash } from "../utils/hashGenerator";
import { cacheService } from "./cacheService";
import { downloader } from "../utils/downloader";
import { getErrorMessage } from "../utils/error";
import type { DetectedContent } from "../middleware/multimodalDetector";

/**
 * Servicio para interactuar con Google Gemini API.
 * Parte de los "Sentidos" en la arquitectura "Córtex Sensorial".
 * Procesa contenido multimedia (imágenes, audio, video, documentos) y genera
 * descripciones textuales para que DeepSeek pueda comprenderlo.
 */
class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  private model: string;
  private multimodalPrompt: string;
  private apiKey: string | null = null;

  constructor() {
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
    this.multimodalPrompt =
      process.env.MULTIMODAL_PROMPT ||
      "Analyze this content thoroughly and describe what you see/hear/read in detail. Include all relevant information. Be precise and comprehensive.";
  }

  /**
   * Obtiene el modelo Gemini a usar.
   * Actualmente se usa un modelo único para todos los tipos de contenido.
   */
  private getModelForContentType(
    _contentType: string,
    _mimeTypeOrExtension: string,
  ): string {
    return this.model;
  }

  /**
   * Obtiene prompt especializado según tipo de contenido.
   * Diseñado para cubrir los aspectos específicos de cada modalidad sensorial.
   */
  private getSpecializedPrompt(
    contentType: string,
    userContext: string = "",
  ): string {
    const basePrompts: Record<string, string> = {
      // Caso 1: Imágenes (diagramas, interfaces, capturas de error)
      image: `Describe esta imagen con precisión técnica para que un programador ciego pueda recrearla.

INSTRUCCIONES ESPECÍFICAS:
1. Si es una INTERFAZ DE USUARIO: Describe layout, elementos, botones, colores, texto visible, jerarquía visual.
2. Si es un DIAGRAMA DE ARQUITECTURA: Describe componentes, conexiones, flujo de datos, relaciones.
3. Si es una CAPTURA DE ERROR: Describe mensajes de error, números de línea, stack traces, contexto visual.
4. Si contiene TEXTO: Transcribe TODO el texto visible preservando estructura y formato.
5. Incluye COORDENADAS RELATIVAS: Posición de elementos importantes.
6. Sé LITERAL y PRECISO: No interpretes, solo describe.

${userContext ? `CONTEXTO DEL USUARIO: "${userContext}"\n\nAdapta la descripción para responder específicamente a esta pregunta.` : ""}`,

      // Caso 2: Audio (logs de voz, grabaciones de reuniones)
      audio: `Transcribe y analiza este audio técnico.

INSTRUCCIONES ESPECÍFICAS:
1. TRANSCRIPCIÓN LITERAL: Transcribe TODO el audio palabra por palabra.
2. ANOTACIONES DE TONO: Indica [TONO SERIO], [TONO URGENTE], [TONO CONFUSO], etc.
3. PUNTOS CLAVE: Resalta los conceptos técnicos, errores mencionados, decisiones tomadas.
4. ESTRUCTURA TEMPORAL: Marca timestamps aproximados [00:00], [00:30], etc.
5. HABLANTES: Identifica diferentes voces si es posible [HABLANTE 1], [HABLANTE 2].

${userContext ? `CONTEXTO DEL USUARIO: "${userContext}"\n\nEnfócate en los aspectos relevantes para esta pregunta.` : ""}`,

      // Caso 3: Video (grabaciones de pantalla, demos)
      video: `Genera un log cronológico de lo que ocurre en este video.

INSTRUCCIONES ESPECÍFICAS:
1. LOG PASO A PASO: Describe eventos en orden temporal.
2. INTERACCIONES: Clics, tecleo, movimientos del cursor.
3. CAMBIOS EN PANTALLA: Aparece/desaparece X, cambia color Y, muestra error Z.
4. AUDIO SIMULTÁNEO: Incluye transcripción del audio sincronizada.
5. MOMENTOS CRÍTICOS: Identifica exactamente cuándo ocurren errores o comportamientos inesperados.

${userContext ? `CONTEXTO DEL USUARIO: "${userContext}"\n\nBusca específicamente lo que el usuario pregunta.` : ""}`,

      // Caso 4: Documentos densos/visuales (PDFs, Excel, Notebooks)
      document: `Extrae y estructura la información de este documento.

INSTRUCCIONES ESPECÍFICAS:
1. TEXTO COMPLETO: Extrae TODO el texto preservando estructura.
2. TABLAS: Convierte a formato Markdown o JSON con headers y datos.
3. GRÁFICOS: Describe tipo de gráfico, ejes, datos representados, tendencias.
4. ESTRUCTURA JERÁRQUICA: Títulos, subtítulos, secciones, listas.
5. DATOS NUMÉRICOS: Extrae números, estadísticas, métricas importantes.
6. RELACIONES ESPACIALES: Describe disposición de elementos en la página.

${userContext ? `CONTEXTO DEL USUARIO: "${userContext}"\n\nExtrae específicamente la información relevante para esta pregunta.` : ""}`,

      // Default
      default: `Analyze this ${contentType} thoroughly and provide the information needed to answer the user's question accurately.

${userContext ? `User's question: "${userContext}"\n\nFocus on providing the specific information needed to answer this question.` : ""}`,
    };

    return basePrompts[contentType] || basePrompts.default;
  }

  /**
   * Carga la API key de las variables de entorno
   */
  private loadApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      logger.warn("⚠️ GEMINI_API_KEY no configurado en .env");
      logger.warn(
        "   Para usar Gemini Multimodal, agrega: GEMINI_API_KEY=tu_api_key",
      );
      logger.warn("   Obtén una en: https://aistudio.google.com/app/apikey");
      throw new Error("GEMINI_API_KEY requerido para análisis multimodal");
    }

    return apiKey;
  }

  /**
   * Inicializa el cliente de Gemini
   */
  private ensureClient(): void {
    if (this.client) return;

    this.apiKey = this.loadApiKey();
    this.client = new GoogleGenerativeAI(this.apiKey);
    logger.info("✓ Cliente Gemini inicializado");
  }

  /**
   * Procesa una fuente de imagen (URL o Base64) a Buffer
   * Con validación robusta de Content-Type
   */
  private async processImageSource(
    source: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    // Caso 1: Base64 data URL
    if (source.includes("data:image/")) {
      try {
        const processed = await processImage(source);
        validateFileSize(processed.data);
        return {
          buffer: processed.data,
          mimeType: processed.mimeType || "image/png",
        };
      } catch (error: unknown) {
        logger.error(
          `Error procesando imagen Base64: ${getErrorMessage(error)}`,
        );
        throw new Error(`Imagen Base64 inválida: ${getErrorMessage(error)}`);
      }
    }

    // Caso 2: URL HTTP/HTTPS
    if (source.startsWith("http")) {
      try {
        // Validar tamaño antes de descargar
        const validation = await downloader.validateFile(source, [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg+xml",
          "image/bmp",
          "image/tiff",
        ]);

        if (!validation.valid) {
          throw new Error(`Imagen no válida: ${validation.reason}`);
        }

        logger.info(
          `✓ Imagen validada: ${(validation.size! / 1024 / 1024).toFixed(2)}MB, ${validation.contentType}`,
        );

        // Intentar descargar como imagen con validación estricta
        const buffer = await downloader.downloadImage(source, [
          "image/jpeg",
          "image/jpg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg+xml",
          "image/bmp",
          "image/tiff",
        ]);

        // Para URLs, usar PNG como formato universal para Gemini
        return {
          buffer,
          mimeType: "image/png",
        };
      } catch (error: unknown) {
        const errorMsg = getErrorMessage(error);

        // Detectar errores específicos de Content-Type
        if (
          errorMsg.includes("Content-Type") ||
          errorMsg.includes("PDF") ||
          errorMsg.includes("HTML")
        ) {
          logger.warn(`⚠️ URL parece no ser una imagen: ${errorMsg}`);

          // Intentar como documento genérico
          try {
            const validation = await downloader.validateFile(source);
            if (!validation.valid) {
              throw new Error(`Documento no válido: ${validation.reason}`);
            }

            const { buffer, contentType } =
              await downloader.downloadFile(source);
            logger.info(
              `✅ URL procesada como documento (${contentType}) en lugar de imagen`,
            );
            return {
              buffer,
              mimeType: contentType,
            };
          } catch (docError: unknown) {
            throw new Error(
              `URL no es imagen válida y falló como documento: ${getErrorMessage(docError)}`,
            );
          }
        }

        // Otro tipo de error
        throw new Error(`Error descargando imagen: ${errorMsg}`);
      }
    }

    // Caso 3: Ruta local o formato no soportado
    throw new Error(
      `Formato de imagen no soportado: ${source.substring(0, 100)}...`,
    );
  }

  /**
   * Analiza contenido multimodal con Gemini (con caché contextual)
   */
  async analyzeContent(
    content: DetectedContent,
    userContext: string = "",
  ): Promise<string> {
    // 1. Verificar si es un PDF - Gemini SÍ soporta PDFs con MIME type application/pdf
    // Mantenemos ambos flujos: local para pequeños, Gemini para calidad/OCR
    if (
      content.type === "pdf" ||
      (content.extension && content.extension === "pdf")
    ) {
      logger.info(
        `📄 PDF detectado - Gemini SÍ soporta PDFs con MIME type application/pdf`,
      );
      // Continuamos con procesamiento Gemini para mejor calidad
    }

    // 2. Procesar contenido según tipo
    let processedData: Buffer;
    let mimeType: string;
    let actualContentType = content.type;

    switch (content.type) {
      case "image":
        // TODAS las imágenes (URLs y Base64) se procesan igual
        const imageResult = await this.processImageSource(content.source);
        processedData = imageResult.buffer;

        // Usar MIME type explícito del contenido si está disponible,
        // de lo contrario usar el detectado por processImageSource
        mimeType = content.mimeType || imageResult.mimeType;

        // Asegurar que el MIME type sea válido para Gemini
        if (!mimeType || mimeType === "application/octet-stream") {
          // Inferir MIME type basado en extensión o contenido
          if (content.extension) {
            const extToMime: Record<string, string> = {
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".png": "image/png",
              ".gif": "image/gif",
              ".webp": "image/webp",
              ".bmp": "image/bmp",
              ".svg": "image/svg+xml",
              ".tiff": "image/tiff",
              ".tif": "image/tiff",
            };
            mimeType =
              extToMime[content.extension.toLowerCase()] || "image/png";
          } else {
            mimeType = "image/png"; // Formato universal para Gemini
          }
        }

        // Determinar subtipo de imagen basado en extensión/contexto
        if (content.extension && ["pdf"].includes(content.extension)) {
          actualContentType = "pdf"; // PDF con imágenes
        } else if (
          userContext.toLowerCase().includes("diagram") ||
          userContext.toLowerCase().includes("architecture")
        ) {
          actualContentType = "image"; // Enfocar en descripción técnica
        }
        break;

      case "audio":
        // Descargar audio desde URL o procesar Base64
        if (content.source.startsWith("http")) {
          // Validar tamaño antes de descargar
          const validation = await downloader.validateFile(content.source);
          if (!validation.valid) {
            throw new Error(`Archivo de audio no válido: ${validation.reason}`);
          }

          logger.info(
            `✓ Audio validado: ${(validation.size! / 1024 / 1024).toFixed(2)}MB, ${validation.contentType}`,
          );

          const { buffer, contentType } = await downloader.downloadFile(
            content.source,
          );
          processedData = buffer;
          mimeType = contentType;
        } else if (content.source.includes("data:audio/")) {
          // Extraer MIME type de data URL
          const dataUrlMatch = content.source.match(
            /^data:([^;]+)(?:;[^;]+)?;base64,(.+)$/,
          );
          if (dataUrlMatch) {
            const [, extractedMimeType, base64Data] = dataUrlMatch;
            processedData = Buffer.from(base64Data, "base64");
            mimeType = extractedMimeType || content.mimeType || "audio/mpeg";
          } else {
            const base64Data = content.source.split(",")[1];
            processedData = Buffer.from(base64Data, "base64");
            mimeType = content.mimeType || "audio/mpeg";
          }
        } else {
          processedData = Buffer.from(
            `[AUDIO CONTENT: ${content.source.substring(0, 100)}...]`,
          );
          mimeType = content.mimeType || "audio/mpeg";
        }
        break;

      case "video":
        // Descargar video desde URL o procesar Base64
        if (content.source.startsWith("http")) {
          // Validar tamaño antes de descargar
          const validation = await downloader.validateFile(content.source);
          if (!validation.valid) {
            throw new Error(`Archivo de video no válido: ${validation.reason}`);
          }

          logger.info(
            `✓ Video validado: ${(validation.size! / 1024 / 1024).toFixed(2)}MB, ${validation.contentType}`,
          );

          const { buffer, contentType } = await downloader.downloadFile(
            content.source,
          );
          processedData = buffer;
          mimeType = contentType;
        } else if (content.source.includes("data:video/")) {
          // Extraer MIME type de data URL
          const dataUrlMatch = content.source.match(
            /^data:([^;]+)(?:;[^;]+)?;base64,(.+)$/,
          );
          if (dataUrlMatch) {
            const [, extractedMimeType, base64Data] = dataUrlMatch;
            processedData = Buffer.from(base64Data, "base64");
            mimeType = extractedMimeType || content.mimeType || "video/mp4";
          } else {
            const base64Data = content.source.split(",")[1];
            processedData = Buffer.from(base64Data, "base64");
            mimeType = content.mimeType || "video/mp4";
          }
        } else {
          processedData = Buffer.from(
            `[VIDEO CONTENT: ${content.source.substring(0, 100)}...]`,
          );
          mimeType = content.mimeType || "video/mp4";
        }
        break;

      case "pdf":
      case "text":
        // Código y texto van directo a DeepSeek,  pero por si acaso
        // Nota: Ahora usamos `type` normalizado OpenCode
        processedData = Buffer.from(content.source);
        mimeType = "text/plain";
        actualContentType = "text"; // Usar prompt de documentos
        break;

      default:
        throw new Error(`Tipo de contenido no soportado: ${content.type}`);
    }

    // 2. Calcular hash contextual
    const hash = generateContextualHash(processedData, userContext);
    logger.debug(`🔍 Hash contextual: ${hash.substring(0, 16)}...`);

    // 3. Consultar caché
    const cached = await cacheService.get(hash);
    if (cached) {
      logger.info(
        `✓ Cache HIT: ${hash.substring(0, 8)}... (${cached.hits} hits)`,
      );
      await cacheService.incrementHits(hash);
      return cached.description;
    }

    logger.info(`✗ Cache MISS: ${hash.substring(0, 8)}...`);

    // 4. Analizar con Gemini
    this.ensureClient();
    const description = await this.analyzeWithGemini(
      processedData,
      mimeType,
      actualContentType,
      userContext,
    );

    // 5. Guardar en caché
    await cacheService.set(hash, description, this.model);

    return description;
  }

  /**
   * Analiza contenido directamente con Gemini
   * Con manejo robusto de filtros de seguridad
   */
  private async analyzeWithGemini(
    contentData: Buffer,
    mimeType: string,
    contentType: string,
    userContext: string = "",
  ): Promise<string> {
    if (!this.client) {
      throw new Error("Cliente Gemini no inicializado");
    }

    try {
      logger.info(`🔄 Analizando ${contentType} con ${this.model}...`);
      const startTime = Date.now();

      const model = this.client.getGenerativeModel({
        model: this.model,
        // Configuración de seguridad para contenido técnico.
        generationConfig: {
          temperature: 0.1, // Más determinístico para análisis técnico
          topP: 0.8,
          topK: 40,
        },
      });

      // Usar prompt especializado según tipo de contenido
      const prompt = this.getSpecializedPrompt(contentType, userContext);

      // Convertir contenido a formato Gemini
      const contentPart = {
        inlineData: {
          data: contentData.toString("base64"),
          mimeType: mimeType,
        },
      };

      const result = await model.generateContent([prompt, contentPart]);
      const response = result.response;

      // Verificar si la respuesta fue bloqueada por seguridad
      if (response.promptFeedback?.blockReason) {
        const blockReason = response.promptFeedback.blockReason;
        logger.warn(`⚠️ Gemini bloqueó el contenido: ${blockReason}`);

        // Devolver mensaje informativo para DeepSeek
        return this.getSafetyBlockedMessage(
          contentType,
          blockReason,
          userContext,
        );
      }

      const text = response.text();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `✓ ${contentType} analizado en ${elapsed}s con ${this.model}`,
      );

      return text;
    } catch (error: any) {
      // Detectar errores específicos de seguridad de Gemini
      const errorMessage = error.message || "";

      if (
        errorMessage.includes("SAFETY") ||
        errorMessage.includes("blocked") ||
        errorMessage.includes("unsafe") ||
        errorMessage.includes("content policy")
      ) {
        logger.warn(
          `🔒 Gemini bloqueó el contenido por seguridad: ${errorMessage}`,
        );

        // Devolver mensaje informativo en lugar de fallar
        return this.getSafetyBlockedMessage(
          contentType,
          "SAFETY_FILTER",
          userContext,
        );
      }

      // Otros errores de API
      logger.error(`✗ Error en Gemini API (${contentType}):`, errorMessage);
      throw new Error(`Gemini Multimodal falló: ${errorMessage}`);
    }
  }

  /**
   * Genera mensaje informativo cuando Gemini bloquea contenido por seguridad
   */
  private getSafetyBlockedMessage(
    contentType: string,
    blockReason: string,
    userContext: string = "",
  ): string {
    const reasons: Record<string, string> = {
      SAFETY: "restricciones de seguridad",
      BLOCKED: "filtros de contenido",
      UNSAFE: "contenido considerado inseguro",
      SAFETY_FILTER: "filtros de seguridad",
      HARM_CATEGORY_HARASSMENT: "posible acoso",
      HARM_CATEGORY_HATE_SPEECH: "posible discurso de odio",
      HARM_CATEGORY_SEXUALLY_EXPLICIT: "contenido sexualmente explícito",
      HARM_CATEGORY_DANGEROUS_CONTENT: "contenido peligroso",
    };

    const reasonText = reasons[blockReason] || "restricciones de seguridad";

    return `[SISTEMA: El ${contentType} no pudo ser analizado por ${reasonText}. 

Contexto del usuario: "${userContext || "No proporcionado"}"

Para continuar:
1. Describe verbalmente el contenido del ${contentType}
2. Explica qué información necesitas extraer
3. Si es un diagrama/error técnico, describe los elementos clave
4. Si contiene texto, transcríbelo manualmente

El asistente podrá ayudarte con la descripción proporcionada.]`;
  }

  /**
   * Método de compatibilidad para imágenes (backward compatibility)
   */
  async analyzeImage(
    imageSource: string,
    userContext: string = "",
  ): Promise<string> {
    return this.analyzeContent(
      {
        source: imageSource,
        type: "image",
        messageIndex: 0,
        internalType: "image",
      },
      userContext,
    );
  }

  async generateDirectResponse(messages: ChatMessage[]): Promise<string> {
    this.ensureClient();

    const geminiMessages = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content ?? ""),
        },
      ],
    }));

    const model = this.client!.getGenerativeModel({
      model: this.model,
    });

    const lastMessage = geminiMessages[geminiMessages.length - 1];
    if (!lastMessage) {
      throw new Error("No hay mensajes para procesar con Gemini");
    }

    try {
      const chat = model.startChat({
        history: geminiMessages.slice(0, -1),
      });
      const result = await chat.sendMessage(lastMessage.parts);
      return result.response.text();
    } catch (error: any) {
      logger.error("Error en generacion directa Gemini:", error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }
}

export const geminiService = new GeminiService();
