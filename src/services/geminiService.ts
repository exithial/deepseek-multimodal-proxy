import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../utils/logger';
import { processImage, validateImageSize } from '../utils/imageProcessor';
import { generateContextualHash } from '../utils/hashGenerator';
import { cacheService } from './cacheService';

class GeminiService {
  private client: GoogleGenerativeAI | null = null;
  private model: string;
  private visionPrompt: string;
  private apiKey: string | null = null;

  constructor() {
    this.model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.visionPrompt = process.env.VISION_PROMPT || 
      'Analyze this image thoroughly and describe what you see in detail. Include all relevant information: text (if any), visual elements, composition, colors, objects, people, interface elements, or any other notable features. Be precise and comprehensive.';
  }

  /**
   * Carga la API key de las variables de entorno
   */
  private loadApiKey(): string {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      logger.warn('⚠️ GEMINI_API_KEY no configurado en .env');
      logger.warn('   Para usar Gemini Vision, agrega: GEMINI_API_KEY=tu_api_key');
      logger.warn('   Obtén una en: https://aistudio.google.com/app/apikey');
      throw new Error('GEMINI_API_KEY requerido para análisis de imágenes');
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
    logger.info('✓ Cliente Gemini inicializado');
  }

  /**
   * Analiza una imagen con Gemini Vision (con caché contextual)
   */
  async analyzeImage(imageSource: string, userContext: string = ''): Promise<string> {
    // 1. Procesar imagen
    const processed = await processImage(imageSource);
    validateImageSize(processed.data);

    // 2. Calcular hash contextual
    const hash = generateContextualHash(processed.data, userContext);
    logger.debug(`🔍 Hash contextual: ${hash.substring(0, 16)}...`);

    // 3. Consultar caché
    const cached = await cacheService.get(hash);
    if (cached) {
      logger.info(`✓ Cache HIT: ${hash.substring(0, 8)}... (${cached.hits} hits)`);
      await cacheService.incrementHits(hash);
      return cached.description;
    }

    logger.info(`✗ Cache MISS: ${hash.substring(0, 8)}...`);

    // 4. Analizar con Gemini
    this.ensureClient();
    const description = await this.analyzeWithGemini(processed.data, userContext);

    // 5. Guardar en caché
    await cacheService.set(hash, description, this.model);

    return description;
  }

  /**
   * Analiza imagen directamente con Gemini
   */
  private async analyzeWithGemini(imageData: Buffer, userContext: string = ''): Promise<string> {
    if (!this.client) {
      throw new Error('Cliente Gemini no inicializado');
    }

    try {
      logger.info(`🔄 Analizando imagen con ${this.model}...`);
      const startTime = Date.now();

      const model = this.client.getGenerativeModel({ model: this.model });

      // Construir prompt adaptativo según contexto del usuario
      let prompt = this.visionPrompt;
      if (userContext) {
        // Prompt inteligente que se adapta a la pregunta del usuario
        prompt = `User's question: "${userContext}"

Analyze the image and provide the information needed to answer the user's question accurately. 

Guidelines:
- If the question asks about TEXT (e.g., "what does it say", "read this", "what text"): Transcribe ALL visible text precisely, preserving structure and hierarchy.
- If the question asks about VISUAL content (e.g., "what do you see", "describe", "what is this"): Provide a detailed visual description including objects, colors, composition, and context.
- If the question asks about UI/INTERFACE (e.g., "what interface", "what screen"): Describe the layout, elements, buttons, and functionality.
- If the question asks about SPECIFIC elements (e.g., "what animal", "what color", "how many"): Focus on those specific aspects.

Be thorough, accurate, and literal. Include all details relevant to answering the user's question.`;
      }

      // Convertir imagen a formato Gemini
      const imagePart = {
        inlineData: {
          data: imageData.toString('base64'),
          mimeType: 'image/png', // Gemini soporta png, jpg, webp
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = result.response;
      const text = response.text();

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Imagen analizada en ${elapsed}s con ${this.model}`);

      return text;

    } catch (error: any) {
      logger.error('✗ Error en Gemini API:', error.message);
      throw new Error(`Gemini Vision falló: ${error.message}`);
    }
  }
}

export const geminiService = new GeminiService();
