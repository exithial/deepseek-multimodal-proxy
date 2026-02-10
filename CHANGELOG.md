# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.3] - 2026-02-09

### Fixed

- **Endpoint de Health**: Sincronizada la versión reportada en `/health` para que coincida dinámicamente con `package.json`.

## [1.2.2] - 2026-02-09

### Added

- **Configuración por Entorno**: Ahora los límites de tokens son totalmente configurables vía `.env` (`DEEPSEEK_CONTEXT_WINDOW_CHAT`, `DEEPSEEK_MAX_OUTPUT_CHAT`, etc.).
- **Límites Granulares**: Control independiente de ventana de contexto y salida para modelos Chat y Reasoner.

### Changed

- **Límites de Salida (Propuesta Captura)**: Aumentados para aprovechar al máximo los modelos (Chat: 8k, Reasoner: 64k).
- **Limpieza de Código**: Eliminadas todas las referencias residuales y comentarios legacy de Ollama en `deepseekService.ts` y documentación interna.

## [1.2.1] - 2026-02-09

### Changed

- **Límites de Salida (Output)**: Aumentados significativamente para aprovechar al máximo la capacidad de los modelos DeepSeek.
  - `DeepSeek Chat`: De 4k a **8k** tokens.
  - `DeepSeek Reasoner`: De 16k a **64k** tokens.
- **Documentación**: Actualizados `README.md` y `MODELS.md` con los nuevos límites y configuración recomendada para OpenCode.

## [1.2.0] - 2026-02-09

### Removed

- **Soporte Ollama**: Eliminada completamente la integración con Ollama. El proxy ahora es exclusivamente para DeepSeek con visión Gemini.
- **Modelos Locales**: Eliminados, ya no se redirigen peticiones a instancias locales.

## [1.1.1] - 2026-02-08

### Fixed

- **Compatibilidad OpenCode**: Corregido problema donde el modelo `qwen2.5:7b-instruct` no funcionaba correctamente en OpenCode, mostrando error "Unable to connect".
- **Streaming Ollama**: Solucionado problema donde OpenCode borraba mensajes después de que Ollama terminaba de responder. Ahora se envía correctamente el chunk final con `finish_reason: 'stop'`.
- **Doble Finalización**: Prevenida llamada duplicada a `onEnd()` en el streaming de Ollama mediante bandera `streamEnded`.

### Changed

- **Simplificación de Modelos Ollama**: Eliminada compatibilidad con `deepseek-coder` de Ollama. Ahora solo `qwen2.5:7b-instruct` está disponible como modelo local.
- **Mapeo de Modelos**: Actualizado para soportar directamente `qwen2.5:7b-instruct` (con dos puntos) para compatibilidad nativa con OpenCode.
- **Endpoint de Modelos**: Reducida lista de modelos expuestos en `/v1/models` para reflejar solo `qwen2.5:7b-instruct` y sus alias.

### Technical

- **Consistencia de Stream**: Implementado ID de stream consistente y timestamp fijo para todos los chunks de una misma respuesta.
- **Formato SSE Mejorado**: Streaming de Ollama ahora envía chunk final con `finish_reason: 'stop'` y `delta: {}` como espera OpenCode.

## [1.1.0] - 2026-02-07

### Added

- **Integración Ollama**: Soporte para modelos locales de Ollama (qwen2.5:7b-instruct y deepseek-coder:6.7b-instruct-q8_0) a través del proxy.
- **Enrutamiento Inteligente**: Sistema que detecta automáticamente si un request debe ir a DeepSeek o Ollama basado en el modelo solicitado.
- **Visión Unificada**: Todos los modelos (DeepSeek y Ollama) ahora se benefician del procesamiento de imágenes con Gemini.
- **Scripts de Automatización**: Sistema completo de scripts bash para instalación, verificación y desinstalación del proxy.
- **Servicio Systemd**: Configuración de inicio automático como servicio del sistema con reinicio automático.
- **Endpoint de Modelos Expandido**: Ahora expone 10 modelos (4 DeepSeek + 6 Ollama) con soporte de visión.

### Changed

- **Arquitectura Proxy**: Modificado para manejar múltiples proveedores (DeepSeek y Ollama) en un solo endpoint.
- **Configuración OpenCode**: Simplificada a 4 modelos principales con visión habilitada para todos.
- **Mapeo de Modelos**: Sistema mejorado que soporta alias y nombres cortos para mayor compatibilidad.
- **Manejo de Errores**: Mejorado para identificar y manejar procesos específicos sin interrumpir OpenCode.

### Fixed

- **Compatibilidad TypeScript**: Corregidos errores de tipos en el servicio de enrutamiento.
- **Permisos Systemd**: Solucionado problema de permisos y entorno para ejecución con nvm.
- **Detección de Procesos**: Scripts mejorados para no detener procesos de OpenCode en ejecución.

## [1.0.0] - 2026-02-06

### Added

- **Initial Release**: Launch of DeepSeek Vision Proxy, enabling vision capabilities for DeepSeek models via OpenAI-compatible API.
- **Vision Engine**: Integration with **Google Gemini 2.5 Flash** for high-speed, accurate image analysis.
- **Smart Caching**: Implemented SHA-256 contextual caching system (Image + User Prompt) to minimize API usage and latency.
- **Adaptive Prompting**: Dynamic prompt generation that injects user context into the vision analysis for more relevant descriptions.
- **Middleware**: Intelligent image detection supporting Base64 strings, URLs, and multipart requests.
- **API**: Full support for `chat/completions` with Server-Sent Events (SSE) streaming.
- **Tools Support**: Complete forward compatibility with OpenAI tools (`tools` and `tool_choice`).
- **Architecture**: Modular design with clean separation between DeepSeek passthrough and Vision processing services.
