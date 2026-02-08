import axios from 'axios';
import { logger } from '../utils/logger';
import type { ChatMessage } from '../types/openai';

class OllamaService {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000');
  }

  /**
   * Mapea el modelo del proxy al modelo de Ollama
   */
  private mapModel(proxyModel: string): string {
    const modelMap: Record<string, string> = {
      // Modelos Ollama locales (solo qwen2.5:7b-instruct)
      'qwen2.5-instruct': 'qwen2.5:7b-instruct',
      'qwen2.5-7b-instruct': 'qwen2.5:7b-instruct',
      
      // Alias para compatibilidad
      'qwen2.5': 'qwen2.5:7b-instruct',
      'qwen': 'qwen2.5:7b-instruct',
    };

    return modelMap[proxyModel] || proxyModel;
  }

  /**
   * Verifica si un modelo está disponible en Ollama
   */
  async isModelAvailable(modelName: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`, {
        timeout: this.timeout,
      });
      
      const models = response.data.models || [];
      const mappedModel = this.mapModel(modelName);
      
      return models.some((model: any) => 
        model.name === mappedModel || model.name.startsWith(`${mappedModel}:`)
      );
    } catch (error) {
      logger.warn(`No se pudo verificar disponibilidad del modelo ${modelName}:`, error);
      return false;
    }
  }

  /**
   * Prepara los mensajes para Ollama
   */
  private prepareMessages(messages: ChatMessage[]): any[] {
    return messages
      .filter(msg => ['system', 'user', 'assistant'].includes(msg.role))
      .map(msg => {
        return {
          role: msg.role,
          content: msg.content === null ? '' : (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
        };
      });
  }

  /**
   * Genera una respuesta usando Ollama
   * 
   * @returns Respuesta en formato Ollama nativo (será convertida a formato OpenAI por deepseekService)
   * @note Esta función es llamada internamente por deepseekService.handleOllamaCompletion()
   */
  async generateCompletion(
    model: string,
    messages: ChatMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
      stream?: boolean;
    } = {}
  ): Promise<any> {
    const mappedModel = this.mapModel(model);
    logger.info(`→ Enviando a Ollama (model: ${mappedModel})`);
    
    const preparedMessages = this.prepareMessages(messages);
    
    const payload: any = {
      model: mappedModel,
      messages: preparedMessages,
      stream: options.stream || false,
      options: {},
    };

    if (options.temperature !== undefined) payload.options.temperature = options.temperature;
    if (options.top_p !== undefined) payload.options.top_p = options.top_p;
    if (options.max_tokens !== undefined) payload.options.num_predict = options.max_tokens;

    try {
      const response = await axios.post(
        `${this.baseURL}/api/chat`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
          responseType: options.stream ? 'stream' : 'json',
        }
      );

      return response.data;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  /**
   * Genera una respuesta con streaming usando Ollama
   */
  async generateCompletionStream(
    model: string,
    messages: ChatMessage[],
    options: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    } = {},
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onEnd: () => void
  ): Promise<void> {
    const mappedModel = this.mapModel(model);
    logger.info(`→ Enviando a Ollama (model: ${mappedModel}, streaming: true)`);
    
    const preparedMessages = this.prepareMessages(messages);
    
    const payload: any = {
      model: mappedModel,
      messages: preparedMessages,
      stream: true,
      options: {},
    };

    if (options.temperature !== undefined) payload.options.temperature = options.temperature;
    if (options.top_p !== undefined) payload.options.top_p = options.top_p;
    if (options.max_tokens !== undefined) payload.options.num_predict = options.max_tokens;

    try {
      const response = await axios.post(
        `${this.baseURL}/api/chat`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
          responseType: 'stream',
        }
      );

       // NOTE: Prevención de doble llamada a onEnd() - Ollama puede emitir 'data.done' y luego 'end'
       let streamEnded = false;
      
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message && data.message.content) {
              onChunk(data.message.content);
            }
            if (data.done && !streamEnded) {
              streamEnded = true;
              onEnd();
            }
          } catch (e) {
            // Ignorar líneas no JSON
          }
        }
      });

      response.data.on('error', (error: Error) => onError(error));
      response.data.on('end', () => {
        if (!streamEnded) {
          streamEnded = true;
          onEnd();
        }
      });

    } catch (error: any) {
      this.handleStreamError(error, onError);
    }
  }

  private handleError(error: any): never {
    if (error.response) {
      logger.error(`✗ Ollama error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw new Error(`Ollama API error: ${error.response.data?.error || error.message}`);
    } else {
      logger.error(`✗ Ollama request error: ${error.message}`);
      throw new Error(`Ollama request failed: ${error.message}`);
    }
  }

  private handleStreamError(error: any, onError: (error: Error) => void) {
    if (error.response) {
      let errorBody = '';
      if (error.response.data && typeof error.response.data.on === 'function') {
        error.response.data.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
        error.response.data.on('end', () => {
          onError(new Error(`Ollama API error: ${error.response.status} - ${errorBody}`));
        });
      } else {
        onError(new Error(`Ollama API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`));
      }
    } else {
      onError(new Error(`Ollama request failed: ${error.message}`));
    }
  }
}

export const ollamaService = new OllamaService();