# Guía Definitiva: Implementación de Claude Code en DeepSeek Multimodal Proxy

Estado: implementado.

> **Documento autocontenido** para implementar soporte completo de Claude Code (Anthropic API) en el proxy actual, manteniendo compatibilidad absoluta con OpenCode (OpenAI API).

## 📋 Tabla de Contenidos

1. [Estado Actual del Proxy](#1-estado-actual-del-proxy)
2. [Arquitectura Existente](#2-arquitectura-existente)
3. [Objetivo de la Implementación](#3-objetivo-de-la-implementación)
4. [Modelo gemini-direct](#4-modelo-gemini-direct)
5. [Tipos y Estructuras Anthropic](#5-tipos-y-estructuras-anthropic)
6. [Adaptador de Traducción](#6-adaptador-de-traducción)
7. [Endpoints y Handlers](#7-endpoints-y-handlers)
8. [Implementación Paso a Paso](#8-implementación-paso-a-paso)
9. [Testing y Verificación](#9-testing-y-verificación)
10. [Ejemplos de Transformación](#10-ejemplos-de-transformación)

---

## 1. Estado Actual del Proxy

### 1.1 Visión General

El **DeepSeek Multimodal Proxy** es un servidor HTTP que implementa la arquitectura "Córtex Sensorial":

- **DeepSeek** = Cerebro (razonamiento, lógica, código)
- **Gemini** = Sentidos (percepción multimodal: imágenes, audio, video, PDFs)
- **Proxy** = Córtex (routing inteligente automático)

### 1.2 Endpoints Actuales (OpenAI-compatible)

```
GET  /health                    # Estado del servicio
GET  /v1/models                 # Lista modelos disponibles
GET  /v1/cache/stats            # Estadísticas de caché
POST /v1/chat/completions       # Chat multimodal (OpenAI API)
```

### 1.3 Modelos Expuestos Actualmente

```json
[
  {
    "id": "deepseek-multimodal-chat",
    "owned_by": "deepseek-proxy",
    "root": "deepseek-chat"
  },
  {
    "id": "deepseek-multimodal-reasoner",
    "owned_by": "deepseek-proxy",
    "root": "deepseek-reasoner"
  }
]
```

### 1.4 Estructura de Archivos Actual

```
src/
├── index.ts                          # Servidor Express + endpoints OpenAI
├── types/
│   └── openai.ts                     # Interfaces OpenAI (ChatMessage, etc.)
├── middleware/
│   ├── multimodalProcessor.ts        # Córtex sensorial (routing inteligente)
│   └── multimodalDetector.ts         # Detector de tipos de contenido
├── services/
│   ├── deepseekService.ts            # Cliente DeepSeek (cerebro)
│   ├── geminiService.ts              # Cliente Gemini (sentidos)
│   └── cacheService.ts               # Sistema de caché SHA-256
└── utils/
    ├── downloader.ts                 # Descarga y validación de archivos
    ├── pdfProcessor.ts               # Procesamiento local de PDFs
    └── hashGenerator.ts              # Hash contextual (contenido + pregunta)
```

### 1.5 Configuración Actual (.env)

```bash
# Servidor
PORT=7777

# Gemini (Sentidos)
GEMINI_API_KEY=xxx
GEMINI_MODEL=gemini-2.5-flash-lite

# DeepSeek (Cerebro)
DEEPSEEK_API_KEY=xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_CONTEXT_WINDOW_CHAT=100000
DEEPSEEK_MAX_OUTPUT_CHAT=8000
DEEPSEEK_CONTEXT_WINDOW_REASONER=100000
DEEPSEEK_MAX_OUTPUT_REASONER=64000

# Caché
CACHE_ENABLED=true
CACHE_DIR=./cache
CACHE_TTL_DAYS=7

# Límites
MAX_FILE_SIZE_MB=50
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```

---

## 2. Arquitectura Existente

### 2.1 Flujo Actual de Requests (OpenCode → OpenAI API)

```
OpenCode Client
    ↓ POST /v1/chat/completions (OpenAI format)
src/index.ts (Express handler)
    ↓ ChatCompletionRequest
multimodalProcessor.ts (routing inteligente)
    ├─ Solo texto → DeepSeek directo (passthrough)
    ├─ Multimedia → downloader.ts → validación
    │   ├─ Imágenes/Audio/Video → geminiService.ts → descripción
    │   └─ PDFs pequeños → pdfProcessor.ts → texto
    │       └─ PDFs grandes → geminiService.ts → descripción
    ↓ Mensajes enriquecidos con descripciones
deepseekService.ts
    ↓ Request a DeepSeek API
deepseekService.ts
    ↓ Response OpenAI format
OpenCode Client
```

### 2.2 Córtex Sensorial - Routing Inteligente

El archivo `multimodalProcessor.ts` implementa la lógica central:

```typescript
export async function processMultimodalContent(
  messages: ChatMessage[],
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "gemini" | "local" | "mixed";
}> {
  // 1. Detectar tipos de contenido
  const analysis = await detectMultimodalContent(messages);

  // 2. Si solo texto → DeepSeek directo
  if (analysis.hasOnlyText) {
    return {
      processedMessages: messages,
      useDeepseekDirectly: true,
      strategy: "direct",
    };
  }

  // 3. Separar contenido por destino
  const geminiContent = await getGeminiRequiredContent(
    analysis.detectedContent,
  );
  const localContent = await getLocalProcessingContent(
    analysis.detectedContent,
  );

  // 4. Procesar con Gemini y/o localmente
  const geminiDescriptions = await Promise.all(
    geminiContent.map((content) =>
      geminiService.analyzeContent(content, userContext),
    ),
  );

  const localDescriptions = await Promise.all(
    localContent.map(async (content) => {
      try {
        return await pdfProcessor.analyzePDF(buffer, userContext);
      } catch {
        // Fallback a Gemini si procesamiento local falla
        return await geminiService.analyzeContent(content, userContext);
      }
    }),
  );

  // 5. Inyectar descripciones en mensajes
  // ... (lógica de reemplazo de contenido)

  return { processedMessages, useDeepseekDirectly: false, strategy };
}
```

### 2.3 Sistema de Caché Contextual

```typescript
// Genera hash único: SHA-256(contenido + pregunta del usuario)
const cacheKey = generateContextualHash(buffer, userContext);
const cached = await cacheService.get(cacheKey);
if (cached) return cached; // Evita llamadas repetidas a Gemini
```

### 2.4 Tipos OpenAI Actuales

```typescript
// src/types/openai.ts
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessageContent[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface MessageContent {
  type:
    | "text"
    | "image_url"
    | "audio_url"
    | "video_url"
    | "document_url"
    | "image"
    | "file";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
  audio_url?: { url: string; format?: string };
  // ...
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: any;
  // ...
}
```

---

## 3. Objetivo de la Implementación

### 3.1 Meta Principal

Habilitar que **Claude Code CLI** (que usa Anthropic Messages API) pueda utilizar este proxy como backend, manteniendo **100% de compatibilidad con OpenCode**.

### 3.2 Modelos que Claude Code Esperará

```
haiku   → gemini-direct (nuevo modelo)
sonnet  → deepseek-multimodal-chat
opus      → deepseek-multimodal-reasoner
```

### 3.3 Nuevos Endpoints Requeridos

```
POST /v1/messages                  # Soporte Anthropic Messages API
GET  /v1/models (Anthropic mode)   # Listar modelos Claude
POST /                             # Heartbeats de Claude Code CLI
POST /api/event_logging/batch      # Telemetría de Claude Code CLI (ignorar)
```

### 3.4 Compatibilidad Absoluta

- ✅ OpenCode sigue usando `/v1/chat/completions` (OpenAI API)
- ✅ Claude Code usará `/v1/messages` (Anthropic API)
- ✅ Ambos comparten el mismo córtex sensorial (Gemini + caché)
- ✅ Sin variables de entorno para activar/desactivar (siempre disponible)
- ✅ ANTHROPIC_API_KEY falso (el proxy acepta cualquier valor)

---

## 4. Modelo gemini-direct

### 4.1 ¿Qué es gemini-direct?

Un **nuevo modelo virtual** que bypasea DeepSeek completamente y usa **solo Gemini** para generar respuestas.

### 4.2 ¿Por qué es necesario?

- Haiku es el modelo "rápido y económico" de Anthropic
- Mapearlo a `deepseek-chat` añadiría latencia innecesaria
- Usar Gemini directo es más rápido y económico para ese perfil

### 4.3 Configuración

```bash
# .env (sin cambios)
GEMINI_MODEL=gemini-2.5-flash-lite  # Será el modelo usado por gemini-direct
```

### 4.4 Routing de gemini-direct

```typescript
// Modificación en multimodalProcessor.ts
export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName: string // NUEVO PARÁMETRO
): Promise<...> {
  // Si el modelo es gemini-direct, solo usar Gemini para responder
  if (modelName === "gemini-direct") {
    // Procesar TODO con Gemini (no enviar a DeepSeek)
    const geminiResponse = await geminiService.generateDirectResponse(messages);
    return {
      processedMessages: [{ role: "assistant", content: geminiResponse }],
      useDeepseekDirectly: false,
      strategy: "gemini-direct"
    };
  }

  // Resto de lógica existente...
}
```

### 4.5 Nueva Función en geminiService.ts

```typescript
// src/services/geminiService.ts
class GeminiService {
  // ... métodos existentes ...

  /**
   * Genera respuesta directa con Gemini (sin DeepSeek)
   * Usado para el modelo gemini-direct (Claude Haiku)
   */
  async generateDirectResponse(messages: ChatMessage[]): Promise<string> {
    this.ensureClient();

    // Convertir mensajes OpenAI a formato Gemini
    const geminiMessages = messages.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof msg.content === "string"
              ? msg.content
              : JSON.stringify(msg.content),
        },
      ],
    }));

    const model = this.client!.getGenerativeModel({
      model: this.modelName, // usa GEMINI_MODEL del .env
    });

    try {
      const chat = model.startChat({
        history: geminiMessages.slice(0, -1),
      });

      const lastMessage = geminiMessages[geminiMessages.length - 1];
      const result = await chat.sendMessage(lastMessage.parts);

      return result.response.text();
    } catch (error: any) {
      logger.error("Error en generación directa Gemini:", error);
      throw new Error(`Gemini error: ${error.message}`);
    }
  }
}
```

### 4.6 Exposición en /v1/models

```typescript
// src/index.ts - Agregar a la lista de modelos
app.get("/v1/models", (req, res) => {
  res.json({
    object: "list",
    data: [
      // Modelos existentes...
      { id: "deepseek-multimodal-chat", ... },
      { id: "deepseek-multimodal-reasoner", ... },

      // NUEVO MODELO
      {
        id: "gemini-direct",
        object: "model",
        created: 1706745600,
        owned_by: "gemini-proxy",
        permission: [],
        root: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        parent: null,
      }
    ]
  });
});
```

---

## 5. Tipos y Estructuras Anthropic

### 5.1 Crear src/types/anthropic.ts

```typescript
/**
 * Tipos para Anthropic Messages API
 * Ref: https://docs.anthropic.com/en/api/messages
 */

export interface AnthropicMessage {
  id: string;
  type: "message";
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | "tool_use" | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface AnthropicContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result" | "thinking";
  text?: string;

  // Image block
  source?: {
    type: "base64" | "url";
    media_type: string;
    data: string;
  };

  // Tool use block
  id?: string;
  name?: string;
  input?: any;

  // Tool result block
  tool_use_id?: string;
  content?: string | AnthropicContentBlock[];
  is_error?: boolean;

  // Thinking block (para DeepSeek Reasoner)
  thinking?: string;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicInputMessage[];
  max_tokens: number;
  metadata?: {
    user_id?: string;
  };
  stop_sequences?: string[];
  stream?: boolean;
  system?: string; // System prompt FUERA del array de mensajes
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: AnthropicTool[];
}

export interface AnthropicInputMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

// Eventos de Streaming
export interface AnthropicStreamEvent {
  type:
    | "message_start"
    | "content_block_start"
    | "content_block_delta"
    | "content_block_stop"
    | "message_delta"
    | "message_stop"
    | "ping"
    | "error";

  message?: Partial<AnthropicMessage>;
  content_block?: AnthropicContentBlock;
  delta?: {
    type: "text_delta" | "input_json_delta";
    text?: string;
    partial_json?: string;
  };
  index?: number;
  usage?: {
    output_tokens: number;
  };
}

export interface AnthropicError {
  type: "error";
  error: {
    type:
      | "invalid_request_error"
      | "authentication_error"
      | "permission_error"
      | "not_found_error"
      | "rate_limit_error"
      | "api_error"
      | "overloaded_error";
    message: string;
  };
}
```

---

## 6. Adaptador de Traducción

### 6.1 Crear src/services/anthropicAdapter.ts

```typescript
import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTool,
  AnthropicStreamEvent,
} from "../types/anthropic";
import type {
  ChatCompletionRequest,
  ChatMessage,
  MessageContent,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "../types/openai";
import { logger } from "../utils/logger";

/**
 * Adaptador para traducir entre Anthropic API y OpenAI API
 * Permite que Claude Code use el proxy sin cambios en el córtex sensorial
 */
class AnthropicAdapter {
  /**
   * Mapea modelos Claude a modelos internos del proxy
   */
  mapClaudeModelToInternal(claudeModel: string): string {
    const mapping: Record<string, string> = {
      "haiku": "gemini-direct",
      "sonnet": "deepseek-multimodal-chat",
      "opus": "deepseek-multimodal-reasoner",
    };

    const mapped = mapping[claudeModel];
    if (!mapped) {
      logger.warn(
        `Modelo Claude desconocido: ${claudeModel}, usando deepseek-multimodal-chat`,
      );
      return "deepseek-multimodal-chat";
    }

    logger.info(`Mapeo: ${claudeModel} → ${mapped}`);
    return mapped;
  }

  /**
   * Traduce request de Anthropic a formato OpenAI interno
   */
  anthropicToInternal(request: AnthropicRequest): ChatCompletionRequest {
    logger.info("🔄 Traduciendo request Anthropic → OpenAI");

    // Mapear modelo
    const internalModel = this.mapClaudeModelToInternal(request.model);

    // Convertir mensajes
    const messages: ChatMessage[] = [];

    // System prompt: En Anthropic es un campo separado, en OpenAI es un mensaje
    if (request.system) {
      messages.push({
        role: "system",
        content: request.system,
      });
    }

    // Convertir cada mensaje de Anthropic
    for (const anthropicMsg of request.messages) {
      const openaiMsg: ChatMessage = {
        role: anthropicMsg.role,
        content: this.convertAnthropicContent(anthropicMsg.content),
      };

      // Manejar tool_use y tool_result
      if (Array.isArray(anthropicMsg.content)) {
        const toolUses = anthropicMsg.content.filter(
          (block) => block.type === "tool_use",
        );
        if (toolUses.length > 0) {
          openaiMsg.tool_calls = toolUses.map((block) => ({
            id: block.id!,
            type: "function",
            function: {
              name: block.name!,
              arguments: JSON.stringify(block.input),
            },
          }));
        }

        const toolResults = anthropicMsg.content.filter(
          (block) => block.type === "tool_result",
        );
        if (toolResults.length > 0) {
          // Tool results en Anthropic se convierten a mensajes role="tool" en OpenAI
          for (const toolResult of toolResults) {
            messages.push({
              role: "tool",
              content:
                typeof toolResult.content === "string"
                  ? toolResult.content
                  : JSON.stringify(toolResult.content),
              tool_call_id: toolResult.tool_use_id!,
            });
          }
          continue; // No agregar el mensaje original, ya procesamos los tool results
        }
      }

      messages.push(openaiMsg);
    }

    // Convertir tools si existen
    let tools: any[] | undefined = undefined;
    if (request.tools) {
      tools = request.tools.map(this.anthropicToolToOpenAI);
    }

    const openaiRequest: ChatCompletionRequest = {
      model: internalModel,
      messages,
      temperature: request.temperature,
      top_p: request.top_p,
      max_tokens: request.max_tokens,
      stream: request.stream || false,
      stop: request.stop_sequences,
      tools,
    };

    logger.debug(`Mensajes traducidos: ${messages.length} mensaje(s)`);
    return openaiRequest;
  }

  /**
   * Convierte content de Anthropic a formato OpenAI
   */
  private convertAnthropicContent(
    content: string | AnthropicContentBlock[],
  ): string | MessageContent[] {
    if (typeof content === "string") {
      return content;
    }

    // Convertir array de content blocks
    const openaiContent: MessageContent[] = [];

    for (const block of content) {
      if (block.type === "text") {
        openaiContent.push({
          type: "text",
          text: block.text!,
        });
      } else if (block.type === "image") {
        // Anthropic usa source.type="base64" o "url"
        if (block.source) {
          if (block.source.type === "base64") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: `data:${block.source.media_type};base64,${block.source.data}`,
              },
            });
          } else if (block.source.type === "url") {
            openaiContent.push({
              type: "image_url",
              image_url: {
                url: block.source.data,
              },
            });
          }
        }
      }
      // tool_use y tool_result se manejan en el nivel superior
    }

    // Si solo hay un bloque de texto, devolver string plano
    if (openaiContent.length === 1 && openaiContent[0].type === "text") {
      return openaiContent[0].text!;
    }

    return openaiContent;
  }

  /**
   * Convierte tool de Anthropic a formato OpenAI
   */
  private anthropicToolToOpenAI(tool: AnthropicTool): any {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: this.cleanJSONSchemaForAnthropic(tool.input_schema),
      },
    };
  }

  /**
   * Limpia JSON Schema para Anthropic (pueden rechazar ciertos campos)
   * Basado en la lección del plugin opencode-antigravity-auth
   */
  private cleanJSONSchemaForAnthropic(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;

    const cleaned = { ...schema };

    // Eliminar campos que Anthropic puede rechazar
    delete cleaned.$schema;
    delete cleaned.$defs;
    delete cleaned.additionalProperties;
    delete cleaned.$ref;
    delete cleaned.const;

    // Recursivamente limpiar properties
    if (cleaned.properties) {
      for (const key in cleaned.properties) {
        cleaned.properties[key] = this.cleanJSONSchemaForAnthropic(
          cleaned.properties[key],
        );
      }
    }

    return cleaned;
  }

  /**
   * Traduce respuesta de DeepSeek/Gemini a formato Anthropic
   */
  internalToAnthropic(
    openaiResponse: ChatCompletionResponse,
    originalModel: string,
  ): AnthropicMessage {
    logger.info("🔄 Traduciendo response OpenAI → Anthropic");

    const choice = openaiResponse.choices[0];
    const message = choice.message;

    // Convertir contenido
    const content: AnthropicContentBlock[] = [];

    // Texto principal
    if (message.content) {
      content.push({
        type: "text",
        text: message.content as string,
      });
    }

    // Tool calls
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        content.push({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.function.name,
          input: JSON.parse(toolCall.function.arguments),
        });
      }
    }

    // Mapear finish_reason
    let stopReason: AnthropicMessage["stop_reason"] = "end_turn";
    if (choice.finish_reason === "length") stopReason = "max_tokens";
    else if (choice.finish_reason === "tool_calls") stopReason = "tool_use";

    const anthropicResponse: AnthropicMessage = {
      id: openaiResponse.id,
      type: "message",
      role: "assistant",
      content,
      model: originalModel,
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: openaiResponse.usage?.prompt_tokens || 0,
        output_tokens: openaiResponse.usage?.completion_tokens || 0,
      },
    };

    return anthropicResponse;
  }

  /**
   * Genera stream de eventos Anthropic a partir de chunks OpenAI
   */
  async *createAnthropicStream(
    openaiChunks: AsyncGenerator<string>,
    originalModel: string,
    requestId: string,
  ): AsyncGenerator<string> {
    logger.info("🔄 Creando stream Anthropic desde chunks OpenAI");

    let firstChunk = true;
    let totalContent = "";

    try {
      for await (const chunk of openaiChunks) {
        // Parsear chunk OpenAI (formato: "data: {...}\n\n")
        if (chunk.startsWith("data: [DONE]")) {
          break;
        }

        if (!chunk.startsWith("data: ")) continue;

        const jsonStr = chunk.slice(6);
        let parsed: ChatCompletionChunk;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        const delta = parsed.choices[0]?.delta;
        if (!delta) continue;

        // Primer chunk: message_start
        if (firstChunk) {
          const messageStart: AnthropicStreamEvent = {
            type: "message_start",
            message: {
              id: requestId,
              type: "message",
              role: "assistant",
              model: originalModel,
              usage: { input_tokens: 0, output_tokens: 0 },
            },
          };
          yield `event: message_start\ndata: ${JSON.stringify(messageStart)}\n\n`;

          const contentBlockStart: AnthropicStreamEvent = {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" },
          };
          yield `event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`;

          firstChunk = false;
        }

        // Contenido incremental
        if (delta.content) {
          totalContent += delta.content;

          const contentDelta: AnthropicStreamEvent = {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text: delta.content,
            },
          };
          yield `event: content_block_delta\ndata: ${JSON.stringify(contentDelta)}\n\n`;
        }

        // Finish reason
        if (parsed.choices[0]?.finish_reason) {
          const contentBlockStop: AnthropicStreamEvent = {
            type: "content_block_stop",
            index: 0,
          };
          yield `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n`;

          let stopReason: AnthropicMessage["stop_reason"] = "end_turn";
          if (parsed.choices[0].finish_reason === "length")
            stopReason = "max_tokens";
          else if (parsed.choices[0].finish_reason === "tool_calls")
            stopReason = "tool_use";

          const messageDelta: AnthropicStreamEvent = {
            type: "message_delta",
            delta: {},
            usage: { output_tokens: Math.ceil(totalContent.length / 4) }, // Estimación
          };
          yield `event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n`;
        }
      }

      // Final: message_stop
      const messageStop: AnthropicStreamEvent = {
        type: "message_stop",
      };
      yield `event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`;
    } catch (error: any) {
      logger.error("Error en stream Anthropic:", error);
      const errorEvent: AnthropicStreamEvent = {
        type: "error",
      };
      yield `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
    }
  }

  /**
   * Mapea reasoning_content de DeepSeek a thinking blocks de Anthropic
   */
  mapReasoningToThinking(reasoningContent: string): AnthropicContentBlock {
    return {
      type: "thinking",
      thinking: reasoningContent,
    };
  }
}

export const anthropicAdapter = new AnthropicAdapter();
```

---

## 7. Endpoints y Handlers

### 7.1 Modificar src/index.ts - Agregar Endpoints Anthropic

```typescript
// ... imports existentes ...
import { anthropicAdapter } from "./services/anthropicAdapter";
import type {
  AnthropicRequest,
  AnthropicMessage,
  AnthropicError,
} from "./types/anthropic";
import { randomUUID } from "crypto";

// ... endpoints existentes (/health, /v1/cache/stats) ...

// ========================================
// ENDPOINTS ANTHROPIC (Claude Code)
// ========================================

/**
 * GET /v1/models (con detección de cliente)
 * Detecta si es Claude Code (header anthropic-version) o OpenCode
 */
app.get("/v1/models", (req: Request, res: Response) => {
  const isAnthropicClient = req.headers["anthropic-version"] !== undefined;

  if (isAnthropicClient) {
    // Respuesta para Claude Code
    logger.info("GET /v1/models (cliente: Claude Code)");
    res.json({
      object: "list",
      data: [
        {
          id: "haiku",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
        {
          id: "sonnet",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
        {
          id: "opus",
          object: "model",
          created: 1706745600,
          owned_by: "anthropic",
        },
      ],
    });
  } else {
    // Respuesta para OpenCode (existente)
    logger.info("GET /v1/models (cliente: OpenCode)");
    res.json({
      object: "list",
      data: [
        {
          id: "deepseek-multimodal-chat",
          object: "model",
          created: 1706745600,
          owned_by: "deepseek-proxy",
          permission: [],
          root: "deepseek-chat",
          parent: null,
        },
        {
          id: "deepseek-multimodal-reasoner",
          object: "model",
          created: 1706745600,
          owned_by: "deepseek-proxy",
          permission: [],
          root: "deepseek-reasoner",
          parent: null,
        },
        {
          id: "gemini-direct",
          object: "model",
          created: 1706745600,
          owned_by: "gemini-proxy",
          permission: [],
          root: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
          parent: null,
        },
      ],
    });
  }
});

/**
 * POST /v1/messages - Anthropic Messages API
 * Endpoint principal para Claude Code
 */
app.post("/v1/messages", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const anthropicRequest = req.body as AnthropicRequest;
    const originalModel = anthropicRequest.model;

    logger.info(
      `POST /v1/messages | model: ${originalModel} | stream: ${anthropicRequest.stream || false}`,
    );

    // 1. Traducir Anthropic → OpenAI
    const openaiRequest =
      anthropicAdapter.anthropicToInternal(anthropicRequest);

    // 2. Procesar contenido multimodal (córtex sensorial)
    const { processedMessages, useDeepseekDirectly, strategy } =
      await processMultimodalContent(
        openaiRequest.messages,
        openaiRequest.model,
      );

    res.setHeader("X-Multimodal-Strategy", strategy);

    if (useDeepseekDirectly) {
      logger.info(
        "✓ Contenido soportado por modelo interno - Passthrough directo",
      );
    } else {
      logger.info(
        `✓ Contenido procesado (${strategy}) - Enrutando a modelo interno`,
      );
    }

    // 3. Crear request procesado
    const processedRequest: ChatCompletionRequest = {
      ...openaiRequest,
      messages: processedMessages,
    };

    // 4. Ejecutar request (streaming o no)
    if (anthropicRequest.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader(
        "anthropic-version",
        req.headers["anthropic-version"] || "2023-06-01",
      );

      const requestId = randomUUID();

      // Generador de chunks OpenAI
      async function* openaiChunksGenerator() {
        let buffer = "";
        await deepseekService.chatCompletionStream(
          processedRequest,
          (chunk) => {
            buffer += chunk;
          },
          (error) => {
            throw error;
          },
          () => {
            // Stream terminado
          },
        );
        // Parsear buffer en chunks
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.trim()) yield line;
        }
      }

      // Convertir a stream Anthropic
      const anthropicStream = anthropicAdapter.createAnthropicStream(
        openaiChunksGenerator(),
        originalModel,
        requestId,
      );

      for await (const event of anthropicStream) {
        res.write(event);
      }

      res.end();
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Request stream Anthropic completado (${elapsed}s total)`);
    } else {
      // Non-streaming
      const openaiResponse = await deepseekService.createChatCompletion(
        processedRequest,
        processedMessages,
      );

      const anthropicResponse = anthropicAdapter.internalToAnthropic(
        openaiResponse,
        originalModel,
      );

      res.setHeader(
        "anthropic-version",
        req.headers["anthropic-version"] || "2023-06-01",
      );
      res.json(anthropicResponse);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Request Anthropic completado (${elapsed}s total)`);
    }
  } catch (error: unknown) {
    logger.error("Error procesando request Anthropic:", error);

    const errorResponse: AnthropicError = {
      type: "error",
      error: {
        type: "api_error",
        message: getErrorMessage(error) || "Error interno del proxy",
      },
    };

    if (res.headersSent) {
      res.write(`event: error\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

/**
 * POST / - Heartbeats de Claude Code CLI
 * Claude Code envía heartbeats periódicos, responder OK silenciosamente
 */
app.post("/", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

/**
 * POST /api/event_logging/batch - Telemetría de Claude Code CLI
 * Ignorar y responder OK
 */
app.post("/api/event_logging/batch", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// ... endpoint /v1/chat/completions existente ...
// ... resto del código existente ...
```

### 7.2 Modificar processMultimodalContent para Soportar gemini-direct

```typescript
// src/middleware/multimodalProcessor.ts

export async function processMultimodalContent(
  messages: ChatMessage[],
  modelName?: string, // NUEVO PARÁMETRO OPCIONAL
): Promise<{
  processedMessages: ChatMessage[];
  useDeepseekDirectly: boolean;
  strategy: "direct" | "gemini" | "local" | "mixed" | "gemini-direct";
}> {
  // Caso especial: gemini-direct bypasea DeepSeek
  if (modelName === "gemini-direct") {
    logger.info(
      "🔮 Modelo gemini-direct detectado - Usando Gemini para respuesta completa",
    );

    const geminiResponse = await geminiService.generateDirectResponse(messages);

    return {
      processedMessages: [
        {
          role: "assistant",
          content: geminiResponse,
        },
      ],
      useDeepseekDirectly: false,
      strategy: "gemini-direct",
    };
  }

  // Resto de la lógica existente...
  const analysis = await detectMultimodalContent(messages);
  // ... (sin cambios)
}
```

---

## 8. Implementación Paso a Paso

### Fase 1: Tipos y Modelo gemini-direct

**Archivos a crear:**

- `src/types/anthropic.ts` (tipos Anthropic)

**Archivos a modificar:**

- `src/services/geminiService.ts` (agregar `generateDirectResponse()`)
- `src/index.ts` (agregar "gemini-direct" a `/v1/models` para OpenCode)
- `src/middleware/multimodalProcessor.ts` (agregar parámetro `model`, lógica gemini-direct)

**Pasos:**

1. Copiar el contenido de la sección 5.1 a `src/types/anthropic.ts`
2. Agregar función `generateDirectResponse()` a `geminiService.ts` (sección 4.5)
3. Modificar signature de `processMultimodalContent()` para aceptar `modelName?: string`
4. Agregar lógica de gemini-direct al inicio de `processMultimodalContent()` (sección 7.2)
5. Agregar modelo "gemini-direct" al endpoint `/v1/models` existente (sección 4.6)

**Verificación Fase 1:**

```bash
# Compilar
npm run build

# Probar con OpenCode que el modelo aparece
curl http://localhost:7777/v1/models | jq '.data[] | select(.id=="gemini-direct")'

# Debería retornar:
# {
#   "id": "gemini-direct",
#   "object": "model",
#   "owned_by": "gemini-proxy",
#   "root": "gemini-2.5-flash-lite",
#   ...
# }
```

---

### Fase 2: Adaptador de Traducción

**Archivos a crear:**

- `src/services/anthropicAdapter.ts`

**Pasos:**

1. Copiar todo el contenido de la sección 6.1 a `src/services/anthropicAdapter.ts`
2. Asegurar que todos los imports estén correctos
3. Compilar y verificar que no hay errores TypeScript

**Verificación Fase 2:**

```bash
npm run build
# No debe haber errores de compilación
```

---

### Fase 3: Endpoints Anthropic

**Archivos a modificar:**

- `src/index.ts` (agregar endpoints `/v1/messages`, `/`, `/api/event_logging/batch`)
- `src/index.ts` (modificar `/v1/models` para detectar cliente)

**Pasos:**

1. Agregar imports de Anthropic al inicio de `src/index.ts`:

   ```typescript
   import { anthropicAdapter } from "./services/anthropicAdapter";
   import type {
     AnthropicRequest,
     AnthropicMessage,
     AnthropicError,
   } from "./types/anthropic";
   import { randomUUID } from "crypto";
   ```

2. Modificar endpoint `/v1/models` para detectar cliente (sección 7.1)

3. Agregar endpoint `POST /v1/messages` (sección 7.1)

4. Agregar endpoints silenciosos (sección 7.1):
   - `POST /`
   - `POST /api/event_logging/batch`

**Verificación Fase 3:**

```bash
npm run build
./scripts/manage.sh restart

# Probar detección de cliente en /v1/models
curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models | jq '.data[].id'
# Debería retornar: haiku, sonnet, opus

curl http://localhost:7777/v1/models | jq '.data[].id'
# Debería retornar: deepseek-multimodal-chat, deepseek-multimodal-reasoner, gemini-direct
```

---

### Fase 4: Testing Manual con Claude Code

**Configuración:**

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777"
export ANTHROPIC_API_KEY="test"  # Cualquier valor, el proxy lo acepta
claude --version
```

Config opcional en `.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_AUTH_TOKEN": "test",
    "ANTHROPIC_API_KEY": "test",
    "ANTHROPIC_BASE_URL": "http://localhost:7777",
    "ANTHROPIC_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "opus",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "sonnet",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL": "sonnet",
    "ENABLE_EXPERIMENTAL_MCP_CLI": "true"
  },
  "model": "sonnet"
}
```

**Pruebas:**

1. **Prueba 1: Haiku (gemini-direct) - Solo texto**

   ```bash
   echo "Explica qué es un proxy HTTP en 2 líneas" | claude --model haiku
   ```

   - **Esperado**: Respuesta generada por Gemini directo
   - **Log esperado**: `🔮 Modelo gemini-direct detectado`

2. **Prueba 2: Sonnet (deepseek-chat) - Con imagen**

   ```bash
   # Preparar imagen de prueba
   echo "Describe esta imagen" > prompt.txt
   claude --model sonnet --image test.jpg < prompt.txt
   ```

   - **Esperado**: Imagen procesada por Gemini → descripción → DeepSeek
   - **Log esperado**: `📊 Contenido detectado: 1 elemento(s)`, `🔍 Procesando image 1/1 con Gemini...`

3. **Prueba 3: Opus (deepseek-reasoner) - Razonamiento**
   ```bash
   echo "Resuelve: Si tengo 3 manzanas y compro el doble de las que tengo, ¿cuántas tengo?" | \
     claude --model opus
   ```

   - **Esperado**: Respuesta con razonamiento de DeepSeek Reasoner
   - **Log esperado**: Modelo mapeado a `deepseek-multimodal-reasoner`

---

### Fase 5: Testing Automatizado

**Crear test/test-claude-code.js:**

```javascript
import axios from "axios";
import fs from "fs";

const BASE_URL = "http://localhost:7777";
const ANTHROPIC_VERSION = "2023-06-01";

async function testAnthropicModels() {
  console.log("🧪 Test 1: GET /v1/models (Anthropic client)");

  const res = await axios.get(`${BASE_URL}/v1/models`, {
    headers: { "anthropic-version": ANTHROPIC_VERSION },
  });

  const models = res.data.data.map((m) => m.id);
  console.log("  Modelos:", models);

  const expected = [
    "haiku",
    "sonnet",
    "opus",
  ];
  const allPresent = expected.every((m) => models.includes(m));

  console.log(allPresent ? "  ✅ PASS" : "  ❌ FAIL");
  return allPresent;
}

async function testHaikuTextOnly() {
  console.log("\n🧪 Test 2: Haiku (gemini-direct) - Solo texto");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "haiku",
      max_tokens: 100,
      messages: [{ role: "user", content: "Di 'hola mundo' y nada más" }],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Content:", res.data.content[0]?.text?.substring(0, 50));
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass =
    res.data.type === "message" &&
    res.headers["x-multimodal-strategy"] === "gemini-direct";
  console.log(pass ? "  ✅ PASS" : "  ❌ FAIL");
  return pass;
}

async function testSonnetWithImage() {
  console.log("\n🧪 Test 3: Sonnet (deepseek-chat) - Con imagen");

  // Generar imagen de prueba (1x1 pixel rojo)
  const redPixel = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
    0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb4, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);

  const base64Image = redPixel.toString("base64");

  const res = await axios.post(
    `${BASE_URL}/v1/messages`,
    {
      model: "sonnet",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: base64Image,
              },
            },
            {
              type: "text",
              text: "¿Qué ves en esta imagen?",
            },
          ],
        },
      ],
    },
    {
      headers: {
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
    },
  );

  console.log("  Response type:", res.data.type);
  console.log("  Strategy header:", res.headers["x-multimodal-strategy"]);

  const pass =
    res.data.type === "message" &&
    ["gemini", "mixed"].includes(res.headers["x-multimodal-strategy"]);
  console.log(pass ? "  ✅ PASS" : "  ❌ FAIL");
  return pass;
}

async function runTests() {
  console.log("🚀 Iniciando tests de Claude Code\n");

  const results = await Promise.all([
    testAnthropicModels(),
    testHaikuTextOnly(),
    testSonnetWithImage(),
  ]);

  const passed = results.filter(Boolean).length;
  console.log(`\n📊 Resultados: ${passed}/${results.length} tests pasados`);

  process.exit(passed === results.length ? 0 : 1);
}

runTests();
```

**Ejecutar:**

```bash
node test/test-claude-code.js
```

---

## 9. Testing y Verificación

### 9.1 Checklist de Verificación

- [ ] **Compilación**: `npm run build` sin errores
- [ ] **Modelos OpenCode**: `curl http://localhost:7777/v1/models` devuelve 3 modelos (deepseek-multimodal-chat, deepseek-multimodal-reasoner, gemini-direct)
- [ ] **Modelos Claude Code**: `curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models` devuelve 3 modelos Claude
- [ ] **gemini-direct funciona**: Request a gemini-direct genera respuesta sin llamar a DeepSeek
- [ ] **Haiku mapea a gemini-direct**: Claude Code con Haiku usa estrategia "gemini-direct"
- [ ] **Sonnet mapea a deepseek-chat**: Claude Code con Sonnet procesa multimedia correctamente
- [ ] **Opus mapea a reasoner**: Claude Code con Opus usa deepseek-multimodal-reasoner
- [ ] **Streaming funciona**: Claude Code con `--stream` recibe eventos Anthropic correctos
- [ ] **Heartbeats respondidos**: `POST /` retorna 200 OK
- [ ] **Telemetría ignorada**: `POST /api/event_logging/batch` retorna 200 OK
- [ ] **OpenCode sigue funcionando**: `curl -X POST http://localhost:7777/v1/chat/completions ...` sin cambios

### 9.2 Logs Esperados

**Para request de Claude Code (Haiku):**

```
POST /v1/messages | model: haiku | stream: false
🔄 Traduciendo request Anthropic → OpenAI
Mapeo: haiku → gemini-direct
🔮 Modelo gemini-direct detectado - Usando Gemini para respuesta completa
✓ Request Anthropic completado (1.2s total)
```

**Para request de Claude Code (Sonnet con imagen):**

```
POST /v1/messages | model: sonnet | stream: false
🔄 Traduciendo request Anthropic → OpenAI
Mapeo: sonnet → deepseek-multimodal-chat
📊 Contenido detectado: 1 elemento(s)
  → 1. image (image/png): data:image/png;base64,...
🔍 Procesando image 1/1 con Gemini...
✓ 1 elemento(s) procesado(s) en 0.8s (1 Gemini, 0 local)
✓ Contenido procesado (gemini) - Enrutando a modelo interno
✓ Request Anthropic completado (2.3s total)
```

### 9.3 Troubleshooting

**Problema: Claude Code no se conecta**

```bash
# Verificar que el proxy está escuchando
curl http://localhost:7777/health

# Verificar que los modelos están disponibles
curl -H "anthropic-version: 2023-06-01" http://localhost:7777/v1/models
```

**Problema: Error "Model not found"**

- Verificar que el mapeo de modelos en `anthropicAdapter.ts` incluye el modelo solicitado
- Revisar logs para ver qué modelo interno se está usando

**Problema: gemini-direct no responde**

- Verificar que `GEMINI_API_KEY` está configurado en `.env`
- Verificar función `generateDirectResponse()` en `geminiService.ts`
- Revisar logs: debe aparecer `🔮 Modelo gemini-direct detectado`

**Problema: Imágenes no se procesan**

- Verificar que el córtex sensorial se activa (log `📊 Contenido detectado`)
- Verificar que Gemini responde (log `🔍 Procesando image...`)

---

## 10. Ejemplos de Transformación

### 10.1 Request: Anthropic → OpenAI

**Entrada (Anthropic):**

```json
{
  "model": "sonnet",
  "max_tokens": 1024,
  "system": "Eres un asistente técnico experto",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGg..."
          }
        },
        {
          "type": "text",
          "text": "¿Qué ves en esta imagen?"
        }
      ]
    }
  ]
}
```

**Salida (OpenAI interno):**

```json
{
  "model": "deepseek-multimodal-chat",
  "messages": [
    {
      "role": "system",
      "content": "Eres un asistente técnico experto"
    },
    {
      "role": "user",
      "content": [
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGg..."
          }
        },
        {
          "type": "text",
          "text": "¿Qué ves en esta imagen?"
        }
      ]
    }
  ],
  "max_tokens": 1024
}
```

### 10.2 Response: OpenAI → Anthropic

**Entrada (DeepSeek response):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1706745600,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "En la imagen veo un pixel rojo brillante..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 50,
    "completion_tokens": 20,
    "total_tokens": 70
  }
}
```

**Salida (Anthropic):**

```json
{
  "id": "chatcmpl-abc123",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "En la imagen veo un pixel rojo brillante..."
    }
  ],
  "model": "sonnet",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 50,
    "output_tokens": 20
  }
}
```

### 10.3 Streaming: OpenAI SSE → Anthropic SSE

**Entrada (OpenAI chunks):**

```
data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":"Hola"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{"content":" mundo"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","created":1706745600,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

**Salida (Anthropic events):**

```
event: message_start
data: {"type":"message_start","message":{"id":"chatcmpl-abc","type":"message","role":"assistant","model":"sonnet","usage":{"input_tokens":0,"output_tokens":0}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hola"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" mundo"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: message_delta
data: {"type":"message_delta","delta":{},"usage":{"output_tokens":2}}

event: message_stop
data: {"type":"message_stop"}
```

---

## ✅ Resumen Final

Esta guía implementa **soporte completo de Claude Code** en el proxy sin afectar OpenCode:

### Nuevos Componentes

- ✅ **`src/types/anthropic.ts`**: Tipos Anthropic Messages API
- ✅ **`src/services/anthropicAdapter.ts`**: Traductor bidireccional Anthropic ↔ OpenAI
- ✅ **Modelo `gemini-direct`**: Bypass de DeepSeek para Haiku

### Endpoints Agregados

- ✅ **`POST /v1/messages`**: Anthropic Messages API
- ✅ **`GET /v1/models` (detección dual)**: Claude models vs OpenAI models
- ✅ **`POST /`**: Heartbeats
- ✅ **`POST /api/event_logging/batch`**: Telemetría

### Modificaciones

- ✅ **`src/middleware/multimodalProcessor.ts`**: Soporte para gemini-direct
- ✅ **`src/services/geminiService.ts`**: Función `generateDirectResponse()`
- ✅ **`src/index.ts`**: Handlers Anthropic + detección de cliente

### Compatibilidad

- ✅ **OpenCode**: Sin cambios, sigue funcionando normalmente
- ✅ **Claude Code**: Totalmente funcional con 3 modelos
- ✅ **Córtex Sensorial**: Compartido por ambos clientes
- ✅ **Caché**: Compartido (mismo hash para mismo contenido)

### Configuración Claude Code

```bash
export ANTHROPIC_BASE_URL="http://localhost:7777/v1"
export ANTHROPIC_API_KEY="test"  # Cualquier valor
claude
```

**El proxy ahora funciona con ambos clientes sin configuración adicional. 🎉**
