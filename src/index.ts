import "dotenv/config";
import express, { Request, Response } from "express";
import { logger } from "./utils/logger";
import { cacheService } from "./services/cacheService";
import { deepseekService } from "./services/deepseekService";
import { geminiService } from "./services/geminiService";
import { processMultimodalContent } from "./middleware/multimodalProcessor";
import { anthropicAdapter } from "./services/anthropicAdapter";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ErrorResponse,
} from "./types/openai";
import type {
  AnthropicRequest,
  AnthropicError,
  AnthropicMessage,
} from "./types/anthropic";
import { getErrorMessage } from "./utils/error";
import packageJson from "../package.json";
import { randomUUID } from "crypto";

const app = express();
const PORT = parseInt(process.env.PORT || "7777");
const DEDUPE_TTL_MS = parseInt(process.env.DEDUPE_TTL_MS || "2000");
const HAIKU_DEFER_MS = parseInt(
  process.env.ANTHROPIC_HAIKU_DEFER_MS || "150",
);

const inFlightAnthropic = new Map<string, Promise<AnthropicMessage>>();
const inFlightAnthropicByContent = new Map<
  string,
  Promise<AnthropicMessage>
>();
const recentAnthropicResponses = new Map<
  string,
  { response: AnthropicMessage; expiresAt: number }
>();

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: any) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const entries = keys.map(
    (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`,
  );
  return `{${entries.join(",")}}`;
}

function getModelRoutingStrategy(model: string): "gemini-direct" | "deepseek-routing" {
  return model === "haiku" ? "gemini-direct" : "deepseek-routing";
}

function getAnthropicRequestKey(request: AnthropicRequest): string {
  const { stream: _stream, ...rest } = request;
  return stableStringify(rest);
}

function getAnthropicContentKey(request: AnthropicRequest): string {
  const { stream: _stream, model: _model, ...rest } = request;
  return stableStringify(rest);
}

function getCachedAnthropicResponse(
  key: string,
): AnthropicMessage | undefined {
  const cached = recentAnthropicResponses.get(key);
  if (!cached) return undefined;
  if (cached.expiresAt < Date.now()) {
    recentAnthropicResponses.delete(key);
    return undefined;
  }
  return cached.response;
}

function cacheAnthropicResponse(key: string, response: AnthropicMessage): void {
  recentAnthropicResponses.set(key, {
    response,
    expiresAt: Date.now() + DEDUPE_TTL_MS,
  });
}

// Middleware con límite de 50MB (compatible con límite de Gemini API)
app.use(express.json({ limit: "50mb" }));

// Health check - Verifica estado del servicio multimodal
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "deepseek-multimodal-proxy",
    version: packageJson.version,
    uptime: process.uptime(),
    capabilities: ["text", "image", "audio", "video", "pdf"],
    max_file_size_mb: parseInt(process.env.MAX_FILE_SIZE_MB || "50"),
  });
});

function createOpenAIResponseFromText(
  content: string,
  model: string,
): ChatCompletionResponse {
  const now = Math.floor(Date.now() / 1000);
  const completionTokens = Math.ceil(content.length / 4);
  return {
    id: `chatcmpl-${randomUUID()}`,
    object: "chat.completion",
    created: now,
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: completionTokens,
      total_tokens: completionTokens,
    },
  };
}

async function* createOpenAIStreamFromText(
  content: string,
  model: string,
  id: string,
): AsyncGenerator<string> {
  const now = Math.floor(Date.now() / 1000);

  const startChunk = {
    id,
    object: "chat.completion.chunk",
    created: now,
    model,
    choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
  };
  yield `data: ${JSON.stringify(startChunk)}\n\n`;

  if (content) {
    const contentChunk = {
      id,
      object: "chat.completion.chunk",
      created: now,
      model,
      choices: [{ index: 0, delta: { content }, finish_reason: null }],
    };
    yield `data: ${JSON.stringify(contentChunk)}\n\n`;
  }

  const endChunk = {
    id,
    object: "chat.completion.chunk",
    created: now,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  };
  yield `data: ${JSON.stringify(endChunk)}\n\n`;
  yield "data: [DONE]\n\n";
}

// Cache stats
app.get("/v1/cache/stats", async (req: Request, res: Response) => {
  try {
    const stats = await cacheService.getStats();
    res.json(stats);
  } catch (error: unknown) {
    logger.error("Error obteniendo stats de cache:", error);
    res.status(500).json({ error: getErrorMessage(error) });
  }
});

// Models endpoint - Lista modelos multimodales disponibles
// Compatible 100% con OpenAI API, expone 2 modelos con capacidades multimodales completas
app.get("/v1/models", (req: Request, res: Response) => {
  const isAnthropicClient = req.headers["anthropic-version"] !== undefined;

  if (isAnthropicClient) {
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
    return;
  }

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
});

// Chat completions - Endpoint principal compatible OpenAI
// Implementa arquitectura "Córtex Sensorial": routing inteligente basado en tipo de contenido
app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request = req.body as ChatCompletionRequest;

    logger.info(
      `POST /v1/chat/completions | model: ${request.model} | stream: ${request.stream || false} | tools: ${!!request.tools}`,
    );

    // Procesar contenido multimodal - Detección de tipos de contenido
    // Routing inteligente: texto/código → DeepSeek, multimedia → Gemini
    const { processedMessages, useDeepseekDirectly, strategy } =
      await processMultimodalContent(request.messages, request.model);

    // Setear header de estrategia para debugging y testing
    res.setHeader("X-Multimodal-Strategy", strategy);

    if (strategy === "gemini-direct") {
      logger.info(
        "OK Contenido procesado (gemini-direct) - Respuesta Gemini directa",
      );
    } else if (useDeepseekDirectly) {
      logger.info("OK Contenido soportado por DeepSeek - Passthrough directo");
    } else {
      logger.info(`OK Contenido procesado (${strategy}) - Enrutando a DeepSeek`);
    }

    // Crear request procesado (preservando tools y otros campos)
    const processedRequest: ChatCompletionRequest = {
      ...request,
      messages: processedMessages,
    };

    if (strategy === "gemini-direct") {
      const assistantMessage = processedMessages[0];
      let content = "";
      if (assistantMessage?.content) {
        if (typeof assistantMessage.content === "string") {
          content = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          const textParts = assistantMessage.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text)
            .join("\n\n");
          content = textParts || JSON.stringify(assistantMessage.content);
        } else {
          content = JSON.stringify(assistantMessage.content);
        }
      }
      content = content || "";

      if (request.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const requestId = `chatcmpl-${randomUUID()}`;
        for await (const chunk of createOpenAIStreamFromText(
          content,
          request.model,
          requestId,
        )) {
          res.write(chunk);
        }
        res.end();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`OK Request stream completado (${elapsed}s total)`);
        return;
      }

      const response = createOpenAIResponseFromText(content, request.model);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`OK Request completado (${elapsed}s total)`);
      res.json(response);
      return;
    }

    // Streaming vs non-streaming
    if (request.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      await deepseekService.chatCompletionStream(
        processedRequest,
        (chunk) => {
          res.write(chunk);
        },
        (error) => {
          const errorResponse: ErrorResponse = {
            error: {
              message: getErrorMessage(error),
              type: "proxy_error",
            },
          };
          res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
          res.end();
        },
        () => {
          res.write("data: [DONE]\n\n");
          res.end();
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          logger.info(`✓ Request stream completado (${elapsed}s total)`);
        },
      );
    } else {
      const response = await deepseekService.createChatCompletion(
        processedRequest,
        processedMessages,
      );
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`✓ Request completado (${elapsed}s total)`);
      res.json(response);
    }
  } catch (error: unknown) {
    logger.error("Error procesando request:", error);

    const errorResponse: ErrorResponse = {
      error: {
        message: getErrorMessage(error) || "Error interno del proxy",
        type: "proxy_error",
      },
    };

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify(errorResponse)}\n\n`);
      res.end();
    } else {
      res.status(500).json(errorResponse);
    }
  }
});

app.post("/v1/messages", async (req: Request, res: Response) => {
  const startTime = Date.now();
  let requestKey = "";
  let contentKey = "";
  let deferred: Deferred<AnthropicMessage> | null = null;
  const requestId = randomUUID();

  try {
    const anthropicRequest = req.body as AnthropicRequest;
    const originalModel = anthropicRequest.model;
    contentKey = getAnthropicContentKey(anthropicRequest);

    if (originalModel === "haiku" && HAIKU_DEFER_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, HAIKU_DEFER_MS));
      const contentInFlight = inFlightAnthropicByContent.get(contentKey);
      if (contentInFlight) {
        logger.info(
          `Haiku defer dedupe (content) | request_id: ${requestId} | model: ${originalModel}`,
        );
        const response = await contentInFlight;
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        res.json(response);
        return;
      }
    }
    requestKey = getAnthropicRequestKey(anthropicRequest);

    const cachedResponse = getCachedAnthropicResponse(requestKey);
    if (cachedResponse) {
      logger.info(
        `Cache HIT (Anthropic dedupe) | request_id: ${requestId} | model: ${originalModel}`,
      );
      if (anthropicRequest.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );

        const content = cachedResponse.content
          .map((block) => (block.type === "text" ? block.text || "" : ""))
          .join("");
        const openaiStream = createOpenAIStreamFromText(
          content,
          originalModel,
          `chatcmpl-${randomUUID()}`,
        );
        const anthropicStream = anthropicAdapter.createAnthropicStream(
          openaiStream,
          originalModel,
          randomUUID(),
        );

        for await (const event of anthropicStream) {
          res.write(event);
        }

        res.end();
      } else {
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        res.json(cachedResponse);
      }
      return;
    }

    const existing = inFlightAnthropic.get(requestKey);
    if (existing) {
      logger.info(
        `In-flight dedupe (Anthropic) | request_id: ${requestId} | model: ${originalModel}`,
      );
      const response = await existing;
      if (anthropicRequest.stream) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );

        const content = response.content
          .map((block) => (block.type === "text" ? block.text || "" : ""))
          .join("");
        const openaiStream = createOpenAIStreamFromText(
          content,
          originalModel,
          `chatcmpl-${randomUUID()}`,
        );
        const anthropicStream = anthropicAdapter.createAnthropicStream(
          openaiStream,
          originalModel,
          randomUUID(),
        );

        for await (const event of anthropicStream) {
          res.write(event);
        }

        res.end();
      } else {
        res.setHeader(
          "anthropic-version",
          req.headers["anthropic-version"] || "2023-06-01",
        );
        res.json(response);
      }
      return;
    }

    deferred = createDeferred<AnthropicMessage>();
    inFlightAnthropic.set(requestKey, deferred.promise);
    if (originalModel !== "haiku") {
      inFlightAnthropicByContent.set(contentKey, deferred.promise);
    }

    logger.info(
      `POST /v1/messages | request_id: ${requestId} | model: ${originalModel} | stream: ${anthropicRequest.stream || false}`,
    );

    const openaiRequest = anthropicAdapter.anthropicToInternal(anthropicRequest);
    const internalModel = openaiRequest.model;

    const modelRoutingStrategy = getModelRoutingStrategy(originalModel);
    logger.info(
      `Routing por modelo: ${originalModel} → ${modelRoutingStrategy}`,
    );

    let processedMessages = openaiRequest.messages;
    let strategy: "gemini-direct" | "direct" | "gemini" | "mixed" | "local" = "direct";
    let useDeepseekDirectly = true;

    if (modelRoutingStrategy === "gemini-direct") {
      strategy = "gemini-direct";
      const geminiResponse = await geminiService.generateDirectResponse(openaiRequest.messages);
      processedMessages = [
        {
          role: "assistant",
          content: geminiResponse,
        },
      ];
      useDeepseekDirectly = false;
      logger.info(
        `Haiku: Todo va a Gemini-direct | request_id: ${requestId}`,
      );
    } else {
      const { processedMessages: pm, useDeepseekDirectly: useDS, strategy: st } =
        await processMultimodalContent(
          openaiRequest.messages,
          openaiRequest.model,
        );
      processedMessages = pm;
      useDeepseekDirectly = useDS;
      strategy = st;
      logger.info(
        `${originalModel}: Routing interno (${strategy}) | request_id: ${requestId}`,
      );
    }

    res.setHeader("X-Multimodal-Strategy", strategy);

    const processedRequest: ChatCompletionRequest = {
      ...openaiRequest,
      messages: processedMessages,
    };

    if (anthropicRequest.stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader(
        "anthropic-version",
        req.headers["anthropic-version"] || "2023-06-01",
      );

      const requestId = randomUUID();

    if (strategy === "gemini-direct") {
      const assistantMessage = processedMessages[0];
      let content = "";
      if (assistantMessage?.content) {
        if (typeof assistantMessage.content === "string") {
          content = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          const textParts = assistantMessage.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text)
            .join("\n\n");
          content = textParts || JSON.stringify(assistantMessage.content);
        } else {
          content = JSON.stringify(assistantMessage.content);
        }
      }
      content = content || "";

        const openaiStream = createOpenAIStreamFromText(
          content,
          openaiRequest.model,
          `chatcmpl-${requestId}`,
        );
        const anthropicStream = anthropicAdapter.createAnthropicStream(
          openaiStream,
          originalModel,
          requestId,
          (finalContent) => {
            const openaiResponse = createOpenAIResponseFromText(
              finalContent,
              openaiRequest.model,
            );
            const anthropicResponse = anthropicAdapter.internalToAnthropic(
              openaiResponse,
              originalModel,
            );
            cacheAnthropicResponse(requestKey, anthropicResponse);
            if (deferred) deferred.resolve(anthropicResponse);
          },
        );

        for await (const event of anthropicStream) {
          res.write(event);
        }

        res.end();
        inFlightAnthropic.delete(requestKey);
        inFlightAnthropicByContent.delete(contentKey);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(
          `OK Request stream Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
        );
        return;
      }

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
          },
        );
        const lines = buffer.split("\n");
        for (const line of lines) {
          if (line.trim()) yield line;
        }
      }

      const anthropicStream = anthropicAdapter.createAnthropicStream(
        openaiChunksGenerator(),
        originalModel,
        requestId,
        (finalContent) => {
          const openaiResponse = createOpenAIResponseFromText(
            finalContent,
            openaiRequest.model,
          );
          const anthropicResponse = anthropicAdapter.internalToAnthropic(
            openaiResponse,
            originalModel,
          );
          cacheAnthropicResponse(requestKey, anthropicResponse);
          if (deferred) deferred.resolve(anthropicResponse);
        },
      );

      for await (const event of anthropicStream) {
        res.write(event);
      }

      res.end();
      inFlightAnthropic.delete(requestKey);
      inFlightAnthropicByContent.delete(contentKey);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `OK Request stream Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
      );
      return;
    }

    if (strategy === "gemini-direct") {
      const assistantMessage = processedMessages[0];
      let content = "";
      if (assistantMessage?.content) {
        if (typeof assistantMessage.content === "string") {
          content = assistantMessage.content;
        } else if (Array.isArray(assistantMessage.content)) {
          const textParts = assistantMessage.content
            .filter((part: any) => part.type === "text" && part.text)
            .map((part: any) => part.text)
            .join("\n\n");
          content = textParts || JSON.stringify(assistantMessage.content);
        } else {
          content = JSON.stringify(assistantMessage.content);
        }
      }
      content = content || "";
      const openaiResponse = createOpenAIResponseFromText(
        content,
        openaiRequest.model,
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
      cacheAnthropicResponse(requestKey, anthropicResponse);
      if (deferred) deferred.resolve(anthropicResponse);
      inFlightAnthropic.delete(requestKey);
      inFlightAnthropicByContent.delete(contentKey);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(
        `OK Request Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
      );
      return;
    }

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
    cacheAnthropicResponse(requestKey, anthropicResponse);
    if (deferred) deferred.resolve(anthropicResponse);
    inFlightAnthropic.delete(requestKey);
    inFlightAnthropicByContent.delete(contentKey);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `OK Request Anthropic completado (${elapsed}s total) | request_id: ${requestId} | internal: ${internalModel}`,
    );
  } catch (error: unknown) {
    if (deferred) deferred.reject(error);
    if (requestKey) inFlightAnthropic.delete(requestKey);
    inFlightAnthropicByContent.delete(contentKey);
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

app.post("/", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

app.post("/api/event_logging/batch", (req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
      type: "not_found",
    },
  });
});

// Inicialización del proxy multimodal
async function init() {
  try {
    logger.info("🚀 Iniciando DeepSeek Multimodal Proxy...");
    logger.info(
      "🎯 Arquitectura 'Córtex Sensorial': DeepSeek = Cerebro, Gemini = Sentidos",
    );
    await cacheService.init();

    app.listen(PORT, () => {
      logger.info(
        `✓ Servidor multimodal escuchando en http://localhost:${PORT}`,
      );
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔌 Modelos: http://localhost:${PORT}/v1/models`);
      logger.info(
        `🎯 Capacidades: texto, imágenes, audio, video, documentos, PDFs`,
      );
      logger.info(
        `📏 Límite por archivo: ${process.env.MAX_FILE_SIZE_MB || "50"}MB`,
      );
      logger.info(
        `  Modelo multimodal: ${process.env.GEMINI_MODEL || "gemini-2.5-flash-lite"}`,
      );
    });
  } catch (error) {
    logger.error(
      "Error fatal al iniciar proxy multimodal:",
      getErrorMessage(error),
    );
    process.exit(1);
  }
}

// Manejo de señales
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

init();
