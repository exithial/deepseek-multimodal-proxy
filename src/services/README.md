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
**Responsabilidad**: Intermediario con la API de DeepSeek y Ollama.
- **Enrutamiento inteligente**: Detecta si el modelo solicitado es de DeepSeek o Ollama.
- **Manejo dual**: Soporta tanto requests normales como streaming (SSE) para ambos proveedores.
- **Procesamiento unificado**: Recibe mensajes procesados (imágenes → descripciones de texto) para todos los modelos.
- **Mapeo de modelos**: Convierte nombres de proxy a modelos destino (ej: `vision-dsk-chat` → `deepseek-chat`).

### `ollamaService.ts`
**Responsabilidad**: Interacción con la API local de Ollama.
- **Comunicación directa**: Conexión con Ollama en `http://localhost:11434`.
- **Mapeo de modelos**: Convierte nombres de proxy a modelos Ollama (ej: `qwen2.5-instruct` → `qwen2.5:7b-instruct`).
- **Formato compatible**: Convierte respuestas de Ollama a formato OpenAI.
- **Streaming**: Soporte para respuestas en tiempo real.

### `cacheService.ts`
**Responsabilidad**: Almacenamiento persistente de descripciones de imágenes.
- **Backend**: Sistema de archivos (JSON).
- **TTL**: Configurable (default 7 días).
- Evita gastos innecesarios de cuota API reutilizando descripciones para imágenes idénticas (basado en hash SHA-256).
