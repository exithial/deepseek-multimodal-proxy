import "dotenv/config";
import express, { Request, Response } from "express";
import { logger } from "./utils/logger";
import { cacheService } from "./services/cacheService";
import { deepseekService } from "./services/deepseekService";
import { processMultimodalContent } from "./middleware/multimodalProcessor";
import type { ChatCompletionRequest, ErrorResponse } from "./types/openai";
import { getErrorMessage } from "./utils/error";
import packageJson from "../package.json";

const app = express();
const PORT = parseInt(process.env.PORT || "7777");

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
  res.json({
    object: "list",
    data: [
      // Modelos DeepSeek Multimodales - Arquitectura "Córtex Sensorial"
      // DeepSeek = Cerebro, Gemini = Sentidos, Proxy = Routing inteligente
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
      await processMultimodalContent(request.messages);

    // Setear header de estrategia para debugging y testing
    res.setHeader("X-Multimodal-Strategy", strategy);

    if (useDeepseekDirectly) {
      logger.info("✓ Contenido soportado por DeepSeek - Passthrough directo");
    } else {
      logger.info(`✓ Contenido procesado (${strategy}) - Enrutando a DeepSeek`);
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
