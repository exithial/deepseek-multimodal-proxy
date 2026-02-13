# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Tests Unitarios con Vitest**: Implementación de suite completa de 103 tests unitarios con cobertura del 64% (statements), sin consumir cuota de APIs mediante mocks.
- **Framework de Testing**: Integración de Vitest como framework principal para testing con soporte de TypeScript.
- **Cobertura de Código**: Soporte para generación de reportes de cobertura con v8.

### Changed

- **BACKLOG.md**: Reorganización de prioridades, moviendo testing y CI/CD a prioridad ALTA.

### Fixed

- **.gitignore**: Agregadas carpetas de cobertura (`coverage/`, `.nyc_output/`, `.vitest/`) al gitignore.

## [1.5.1] - 2026-02-12

### Added

- **Soporte Gemini Direct**: Ahora el modelo `gemini-direct` es accesible directamente vía endpoint de OpenAI para bypass completo de DeepSeek.

## [1.5.0] - 2026-02-11

### Added

- **Routing Inteligente por Modelo**: Nueva función `getModelRoutingStrategy()` que enruta automáticamente `haiku` → `gemini-direct` y otros modelos → `deepseek-routing`.
- **Soporte Extendido de Tipos de Contenido**: Adición de tipos `input_audio`, `clipboard`, `file` en el adaptador Anthropic para compatibilidad completa con Claude Code.
- **Validación de Contenido Vacío**: Mejora en el manejo de texto vacío en el adaptador Anthropic para evitar errores de procesamiento.

### Changed

- **Optimización de Routing para Haiku**: Modelo `haiku` ahora usa estrategia `gemini-direct` para respuestas más rápidas, bypass total de DeepSeek.
- **Manejo Mejorado de Contenido Multimodal**: Procesamiento más robusto de arrays de contenido en estrategia `gemini-direct`.
- **Cache Diferenciada por Modelo**: Sistema de cache ahora distingue entre modelos para evitar contaminación cruzada.

### Fixed

- **Compatibilidad con Tipos de Contenido Claude**: Corrección en el adaptador Anthropic para manejar correctamente `input_audio`, `clipboard` y `file` con datos Base64.
- **Procesamiento de Texto Vacío**: Evita errores cuando el contenido de mensajes assistant está vacío en estrategia `gemini-direct`.

## [1.4.0] - 2026-02-11

### Added

- **Claude Code (Anthropic) API**: Soporte completo de `/v1/messages` con adaptador Anthropic y streaming SSE compatible.
- **Modelos Claude Simplificados**: Alias `haiku`, `sonnet`, `opus` para selección directa desde Claude Code.
- **Compatibilidad Multimodal Anthropic**: Soporte para `image`, `audio_url`, `video_url` y `document_url` en Claude.
- **Tests Claude Code**: Nueva suite `test/test-claude-code.js` con cobertura de texto, imagen, audio, video, PDF y streaming.
- **Limpieza de logs**: Nuevo comando `proxy:logs:clear` y opción `logs --clear`.

### Changed

- **Modelos Claude en /v1/models**: Respuesta para clientes Anthropic ahora expone `haiku`, `sonnet`, `opus`.

### Fixed

- **Dedupe de requests Anthropic**: Ventana corta para evitar duplicados del CLI y reducir costo.
- **Trazabilidad de requests**: Logs ahora incluyen `request_id` e `internal` para correlación.

## [1.3.1] - 2026-02-10

### Added

- **Unificación de Scripts**: Consolidación de múltiples scripts de gestión en `manage.sh` (start, stop, status, logs, uninstall).
- **Setup Simplificado**: El instalador principal ahora es `setup.sh` (anteriormente `setup-deepseek-proxy.sh`).
- **Integración NPM**: Nuevos comandos rápidos en `package.json` (`npm run setup`, `npm run status`, `npm run proxy:*`).

### Fixed

- **Persistencia de Servicio**: Corregida la detección de rutas reales de Node para evitar fallos por rutas temporales de Yarn en el servicio systemd (Error 203/EXEC).

## [1.3.0] - 2026-02-10

### Added

- **Multimodalidad Completa**: Soporte nativo para audio y video usando Gemini 2.5 Flash Lite.
- **Routing Inteligente**: Nuevo sistema de detección (`multimodalDetector.ts`) que clasifica contenido en 8 tipos (incluyendo soporte robusto para Data URIs/Base64).
- **Suite de Pruebas Maestra**: Nuevo script `test/test-master.js` para validación automatizada de todas las trayectorias de routing (Text, Image, Audio, Video, PDF, Base64, Streaming).
- **Procesamiento de Documentos**: Soporte para análisis de documentos (Word, Excel, PowerPoint) y PDFs vía Gemini API.
- **Procesamiento Local de PDF**: Extracción de texto local para PDFs pequeños (<1MB) para velocidad y privacidad.
- **Validación Proactiva**: Peticiones HEAD para validar tamaño de archivos (>50MB) antes de iniciar descargas.

### Fixed

- **Base64 Detection**: Corregido problema de routing donde las imágenes en Base64 se enviaban directamente a DeepSeek en lugar de Gemini.
- **Streaming Consistency**: Mejora en el cierre de streams SSE para asegurar compatibilidad total con el cliente de OpenCode.
- **Tipado TypeScript**: Actualizadas interfaces de `MessageContent` para incluir `input_audio` y otros tipos multimodales.

### Changed

- **Identidad del Proxy**: Renombrado de "Vision Proxy" a "Multimodal Proxy" para reflejar nuevas capacidades.
- **Integración Gemini**: Actualizado `geminiService.ts` para manejar múltiples tipos de contenido más allá de imágenes.
- **Lógica de Routing**: El passthrough a DeepSeek ahora es selectivo (solo texto/código), desviando todo el contenido multimedia a Gemini.
- **Manejo de PDFs**: Implementado sistema híbrido (Local para velocidad/privacidad, Gemini para complejidad/OCR).
- **Validación de Tamaño**: Implementadas requests HEAD previas a la descarga para rechazar archivos > 50MB tempranamente.

### Documentation

- **Guías**: Actualizados `README.md`, `MODELS.md` y `TESTING.md` con la nueva terminología multimodal.
- **Ejemplos**: Añadidos casos de uso para audio, video y documentos complejos.

## [1.2.5] - 2026-02-09

### Fixed

- **Script de Inicio**: Simplificado `start.sh` para configuración de servicio systemd.

## [1.2.4] - 2026-02-09

### Changed

- **Modelo Gemini Actualizado**: Cambiado de `gemini-2.5-flash` a `gemini-2.5-flash-lite` para análisis de imágenes más rápido y eficiente.
- **Configuración por Defecto**: Actualizados `.env.example` y `.env` con el nuevo modelo por defecto.
- **Documentación**: Actualizado `MODELS.md` para reflejar el cambio de modelo.

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
