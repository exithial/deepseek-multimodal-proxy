# Servicios del Sistema

Este directorio contiene la lógica de negocio core del proxy.

## Descripción de Servicios

### `geminiService.ts`

**Responsabilidad**: Gestionar la interacción con la API de Google Gemini para visión.

- **Funciones Principales**:
  - `analyzeImage(source, context)`: Orquesta el proceso de visión (hash -> cache -> api).
  - Generación de prompts adaptativos basados en el contexto del chat del usuario.
  - Utiliza `GEMINI_API_KEY` para autenticación directa.

### `deepseekService.ts`

**Responsabilidad**: Intermediario con la API de DeepSeek.

- **Manejo de Completions**: Soporta tanto requests normales como streaming (SSE).
- **Procesamiento unificado**: Recibe mensajes procesados (imágenes → descripciones de texto).
- **Mapeo de modelos**: Convierte nombres de proxy a modelos destino (ej: `deepseek-multimodal-chat` → `deepseek-chat`).
- **Límites Dinámicos**: Gestiona límites de contexto y salida configurables por entorno.

### `cacheService.ts`

**Responsabilidad**: Almacenamiento persistente de descripciones de imágenes.

- **Backend**: Sistema de archivos (JSON).
- **TTL**: Configurable (default 7 días).
- Evita gastos innecesarios de cuota API reutilizando descripciones para imágenes idénticas (basado en hash SHA-256).
