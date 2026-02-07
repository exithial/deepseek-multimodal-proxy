import axios from 'axios';
import { logger } from '../utils/logger';
import { ollamaService } from './ollamaService';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatMessage } from '../types/openai';

class DeepSeekService {
  private apiKey: string;
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
    this.baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    this.timeout = parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '30000');

    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY no configurado en .env');
    }
  }

  /**
   * Mapea el modelo del proxy al modelo destino
   */
  private mapModel(proxyModel: string): { target: 'deepseek' | 'ollama', model: string } {
    // Modelos Ollama
    const ollamaModels = [
      'qwen2.5-instruct',
      'qwen2.5-7b-instruct', 
      'deepseek-coder-instruct',
      'deepseek-coder-6.7b-instruct',
      'qwen2.5',
      'deepseek-coder',
      'qwen',
      'coder'
    ];

    if (ollamaModels.includes(proxyModel)) {
      const ollamaModelMap: Record<string, string> = {
        'qwen2.5-instruct': 'qwen2.5:7b-instruct',
        'qwen2.5-7b-instruct': 'qwen2.5:7b-instruct',
        'deepseek-coder-instruct': 'deepseek-coder:6.7b-instruct-q8_0',
        'deepseek-coder-6.7b-instruct': 'deepseek-coder:6.7b-instruct-q8_0',
        'qwen2.5': 'qwen2.5:7b-instruct',
        'deepseek-coder': 'deepseek-coder:6.7b-instruct-q8_0',
        'qwen': 'qwen2.5:7b-instruct',
        'coder': 'deepseek-coder:6.7b-instruct-q8_0',
      };
      
      return {
        target: 'ollama',
        model: ollamaModelMap[proxyModel] || proxyModel
      };
    }

    // Modelos DeepSeek
    if (proxyModel.includes('reasoner')) {
      return { target: 'deepseek', model: 'deepseek-reasoner' };
    }
    
    const deepseekModelMap: Record<string, string> = {
      'deepseek-vision-chat': 'deepseek-chat',
      'vision-dsk-chat': 'deepseek-chat',
      'deepseek-vision-reasoner': 'deepseek-reasoner',
      'vision-dsk-reasoner': 'deepseek-reasoner',
    };

    return {
      target: 'deepseek',
      model: deepseekModelMap[proxyModel] || 'deepseek-chat'
    };
  }



  /**
   * Trunca el historial de mensajes para que quepa en el contexto
   */
  private truncateMessages(messages: ChatMessage[], maxContextTokens: number = 100000): ChatMessage[] {
    const estimateTokens = (text: string | null) => Math.ceil((text || '').length / 3);

    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    let systemTokens = systemMessages.reduce((sum, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return sum + estimateTokens(content);
    }, 0);

    if (systemTokens > maxContextTokens * 0.3) {
      systemMessages.splice(1); 
      const content = typeof systemMessages[0]?.content === 'string' ? systemMessages[0].content : JSON.stringify(systemMessages[0]?.content);
      systemTokens = estimateTokens(content);
    }

    const result = [...systemMessages];
    let currentTokens = systemTokens;
    const maxTokensForHistory = maxContextTokens - systemTokens;

    for (let i = otherMessages.length - 1; i >= 0; i--) {
      const msg = otherMessages[i];
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      const msgTokens = estimateTokens(content);
      
      if (currentTokens + msgTokens > maxTokensForHistory) {
        break;
      }

      result.splice(systemMessages.length, 0, msg);
      currentTokens += msgTokens;
    }

    return result;
  }

  /**
   * Procesa los mensajes para asegurar que son compatibles con DeepSeek
   */
  private prepareMessages(messages: ChatMessage[]): any[] {
    return messages
      .filter(msg => ['system', 'user', 'assistant', 'tool'].includes(msg.role))
      .map(msg => {
        const prepared: any = {
          role: msg.role,
          content: msg.content === null ? null : (typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)),
        };
        
        if (msg.name) prepared.name = msg.name;
        if (msg.tool_calls) prepared.tool_calls = msg.tool_calls;
        if (msg.tool_call_id) prepared.tool_call_id = msg.tool_call_id;
        
        return prepared;
      });
  }

  /**
   * Maneja las completiones de Ollama
   */
  private async handleOllamaCompletion(request: ChatCompletionRequest, model: string): Promise<ChatCompletionResponse> {
    try {
      const response = await ollamaService.generateCompletion(model, request.messages, {
        temperature: request.temperature,
        max_tokens: request.max_tokens,
        top_p: request.top_p,
        stream: false,
      });

      // Convertir respuesta de Ollama a formato OpenAI
      return {
        id: `ollama-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: response.message?.content || '',
          },
          finish_reason: 'stop',
          logprobs: null,
        }],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    } catch (error: any) {
      logger.error(`✗ Ollama error: ${error.message}`);
      throw new Error(`Ollama request failed: ${error.message}`);
    }
  }

  /**
   * Maneja streaming de Ollama
   */
  private async handleOllamaStream(
    request: ChatCompletionRequest,
    model: string,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onEnd: () => void
  ): Promise<void> {
    try {
      await ollamaService.generateCompletionStream(
        model,
        request.messages,
        {
          temperature: request.temperature,
          max_tokens: request.max_tokens,
          top_p: request.top_p,
        },
        (content: string) => {
          // Convertir a formato SSE
          const chunk = {
            id: `ollama-${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{
              index: 0,
              delta: {
                role: 'assistant',
                content: content,
              },
              finish_reason: null,
              logprobs: null,
            }],
          };
          onChunk(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        onError,
        onEnd
      );
    } catch (error: any) {
      onError(new Error(`Ollama stream failed: ${error.message}`));
    }
  }

  /**
   * Forward del request a DeepSeek o Ollama (sin streaming)
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const mapped = this.mapModel(request.model);
    
    // Enrutar a Ollama si es un modelo local
    if (mapped.target === 'ollama') {
      return this.handleOllamaCompletion(request, mapped.model);
    }
    
    logger.info(`→ Forwarding to DeepSeek (model: ${mapped.model})`);
    
    const validMessages = this.prepareMessages(request.messages);
    const truncatedMessages = this.truncateMessages(validMessages, 100000);

    const payload: any = {
      model: mapped.model,
      messages: truncatedMessages,
      stream: false,
    };

    // Forward tool-related fields
    if (request.tools) payload.tools = request.tools;
    if (request.tool_choice) payload.tool_choice = request.tool_choice;

    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.top_p !== undefined) payload.top_p = request.top_p;
    
    const maxOutputTokens = mapped.model === 'deepseek-reasoner' ? 16000 : 4000;
    const requestedMaxTokens = request.max_tokens || maxOutputTokens;
    payload.max_tokens = Math.min(requestedMaxTokens, maxOutputTokens);
    
    if (request.frequency_penalty !== undefined) payload.frequency_penalty = request.frequency_penalty;
    if (request.presence_penalty !== undefined) payload.presence_penalty = request.presence_penalty;
    if (request.stop !== undefined) payload.stop = request.stop;
    
    try {
      const response = await axios.post<ChatCompletionResponse>(
        `${this.baseURL}/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
        }
      );
      return response.data;
    } catch (error: any) {
      this.handleError(error);
    }
  }

  /**
   * Forward del request a DeepSeek o Ollama con streaming (SSE)
   */
  async chatCompletionStream(
    request: ChatCompletionRequest,
    onChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onEnd: () => void
  ): Promise<void> {
    const mapped = this.mapModel(request.model);
    
    // Enrutar a Ollama si es un modelo local
    if (mapped.target === 'ollama') {
      return this.handleOllamaStream(request, mapped.model, onChunk, onError, onEnd);
    }
    
    logger.info(`→ Forwarding to DeepSeek (model: ${mapped.model}, streaming: true)`);
    
    const validMessages = this.prepareMessages(request.messages);
    const truncatedMessages = this.truncateMessages(validMessages, 100000);

    const payload: any = {
      model: mapped.model,
      messages: truncatedMessages,
      stream: true,
    };

    // Forward tool-related fields
    if (request.tools) payload.tools = request.tools;
    if (request.tool_choice) payload.tool_choice = request.tool_choice;

    if (request.temperature !== undefined) payload.temperature = request.temperature;
    if (request.top_p !== undefined) payload.top_p = request.top_p;
    
    const maxOutputTokens = mapped.model === 'deepseek-reasoner' ? 16000 : 4000;
    const requestedMaxTokens = request.max_tokens || maxOutputTokens;
    payload.max_tokens = Math.min(requestedMaxTokens, maxOutputTokens);
    
    if (request.frequency_penalty !== undefined) payload.frequency_penalty = request.frequency_penalty;
    if (request.presence_penalty !== undefined) payload.presence_penalty = request.presence_penalty;
    if (request.stop !== undefined) payload.stop = request.stop;
    
    try {
      const response = await axios.post(
        `${this.baseURL}/chat/completions`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          timeout: this.timeout,
          responseType: 'stream',
        }
      );

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              onEnd();
              return;
            }
            onChunk(`data: ${data}\n\n`);
          }
        }
      });

      response.data.on('error', (error: Error) => onError(error));
      response.data.on('end', () => onEnd());

    } catch (error: any) {
      this.handleStreamError(error, onError);
    }
  }

  private handleError(error: any): never {
    if (error.response) {
      logger.error(`✗ DeepSeek error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      throw new Error(`DeepSeek API error: ${error.response.data?.error?.message || error.message}`);
    } else {
      logger.error(`✗ DeepSeek request error: ${error.message}`);
      throw new Error(`DeepSeek request failed: ${error.message}`);
    }
  }

  private handleStreamError(error: any, onError: (error: Error) => void) {
    if (error.response) {
      let errorBody = '';
      if (error.response.data && typeof error.response.data.on === 'function') {
        error.response.data.on('data', (chunk: Buffer) => { errorBody += chunk.toString(); });
        error.response.data.on('end', () => {
          onError(new Error(`DeepSeek API error: ${error.response.status} - ${errorBody}`));
        });
      } else {
        onError(new Error(`DeepSeek API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`));
      }
    } else {
      onError(new Error(`DeepSeek request failed: ${error.message}`));
    }
  }
}

export const deepseekService = new DeepSeekService();