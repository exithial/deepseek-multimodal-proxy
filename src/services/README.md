# Servicios del Sistema

Este directorio contiene la lógica de negocio core del proxy.

## Descripción de Servicios

### `geminiService.ts`
**Responsabilidad**: Gestionar la interacción con la API de Google Gemini.
- **Funciones Principales**:
    - `analyzeImage(source, context)`: Orquesta el proceso de visión (hash -> cache -> api).
    - Generación de prompts adaptativos basados en el contexto del chat del usuario.
    - Utiliza `GEMINI_API_KEY` para autenticación directa.

### `deepseekService.ts`
**Responsabilidad**: Intermediario con la API de DeepSeek.
- Maneja tanto requests normales como streaming (SSE).
- Recibe los mensajes ya procesados (donde las imágenes han sido sustituidas por descripciones de texto).

### `cacheService.ts`
**Responsabilidad**: Almacenamiento persistente de descripciones de imágenes.
- **Backend**: Sistema de archivos (JSON).
- **TTL**: Configurable (default 7 días).
- Evita gastos innecesarios de cuota API reutilizando descripciones para imágenes idénticas (basado en hash SHA-256).
