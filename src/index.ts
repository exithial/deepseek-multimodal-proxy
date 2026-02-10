import "dotenv/config";
import express, { Request, Response } from "express";
import { logger } from "./utils/logger";
import { cacheService } from "./services/cacheService";
import { deepseekService } from "./services/deepseekService";
import {
  processImagesInMessages,
  detectImages,
} from "./middleware/imageDetector";
import type { ChatCompletionRequest, ErrorResponse } from "./types/openai";
import { getErrorMessage } from "./utils/error";

const app = express();
const PORT = parseInt(process.env.PORT || "7777");

// Middleware
app.use(express.json({ limit: "50mb" }));

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    service: "deepseek-vision-proxy",
    version: "1.0.0",
    uptime: process.uptime(),
  });
});

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

// Models endpoint
app.get("/v1/models", (req: Request, res: Response) => {
  res.json({
    object: "list",
    data: [
      // Modelos DeepSeek con visión
      {
        id: "vision-dsk-chat",
        object: "model",
        created: 1706745600,
        owned_by: "deepseek-proxy",
        permission: [],
        root: "deepseek-chat",
        parent: null,
      },
      {
        id: "vision-dsk-reasoner",
        object: "model",
        created: 1706745600,
        owned_by: "deepseek-proxy",
        permission: [],
        root: "deepseek-reasoner",
        parent: null,
      },
      {
        id: "deepseek-vision-chat",
        object: "model",
        created: 1706745600,
        owned_by: "deepseek-proxy",
        permission: [],
        root: "deepseek-chat",
        parent: null,
      },
      {
        id: "deepseek-vision-reasoner",
        object: "model",
        created: 1706745600,
        owned_by: "deepseek-proxy",
        permission: [],
        root: "deepseek-reasoner",
        parent: null,
      },
    ],
  });
});

// Chat completions (principal endpoint)
app.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const request = req.body as ChatCompletionRequest;

    logger.info(
      `POST /v1/chat/completions | model: ${request.model} | stream: ${request.stream || false} | tools: ${!!request.tools}`,
    );

    // Detectar imágenes
    const hasImages = detectImages(request.messages).length > 0;

    let processedMessages = request.messages;

    if (hasImages) {
      logger.info("🖼️ Imágenes detectadas - Procesando con Gemini Vision...");
      processedMessages = await processImagesInMessages(request.messages);
    }

    // Crear request procesado (preservando tools y otros campos)
    const processedRequest: ChatCompletionRequest = {
      ...request,
      messages: processedMessages,
    };

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
      const response = await deepseekService.chatCompletion(processedRequest);
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

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: {
      message: `Ruta no encontrada: ${req.method} ${req.path}`,
      type: "not_found",
    },
  });
});

// Inicialización
async function init() {
  try {
    logger.info("🚀 Iniciando DeepSeek Vision Proxy...");
    await cacheService.init();

    app.listen(PORT, () => {
      logger.info(`✓ Servidor escuchando en http://localhost:${PORT}`);
      logger.info(
        `  Vision Model: ${process.env.GEMINI_MODEL || "gemini-2.5-flash"}`,
      );
    });
  } catch (error) {
    logger.error("Error fatal al iniciar:", getErrorMessage(error));
    process.exit(1);
  }
}

// Manejo de señales
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

init();
