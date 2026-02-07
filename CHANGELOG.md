# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
