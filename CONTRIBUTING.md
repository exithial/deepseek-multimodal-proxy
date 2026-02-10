# Guía de Contribución

¡Gracias por tu interés en colaborar con **DeepSeek Multimodal Proxy**! Este proyecto implementa la arquitectura "Córtex Sensorial" y tu ayuda es fundamental para mejorar la percepción multimodal de los LLMs.

## 🌟 Cómo puedes ayudar

### 1. Reportar Errores (Bugs)

Si encuentras algo que no funciona:

1. Revisa si ya existe un Issue abierto.
2. Abre un nuevo Issue detallando el contenido que falló (URL/Base64), los logs de `./scripts/manage.sh logs` y el comportamiento esperado.

### 2. Enviar Pull Requests

1. Haz un **Fork** del repositorio.
2. Crea una rama (`feature/mejora` o `fix/error`).
3. Envía el Pull Request detallando los cambios.

## 🛠️ Estructura del Proyecto

Para contribuir de forma efectiva, es importante entender dónde vive cada parte de la lógica:

- `src/index.ts`: Punto de entrada de la aplicación Express y routing principal (OpenAI API compatibility).
- `src/middleware/`:
  - `multimodalDetector.ts`: El corazón del "Córtex". Decide si una petición va a DeepSeek o a Gemini.
  - `multimodalProcessor.ts`: Gestiona la transformación de archivos/URLs a contenido procesable.
  - `imageDetector.ts`: Lógica específica para identificar formatos de imagen.
- `src/services/`:
  - `geminiService.ts`: Integración con la API de Google (Sistema de Percepción).
  - `deepseekService.ts`: Integración con la API de DeepSeek (Sistema de Razonamiento).
  - `cacheService.ts`: Lógica de caché contextual basada en hashes SHA-256.
- `src/utils/`:
  - `pdfProcessor.ts`: Lógica de routing inteligente y procesamiento local de PDFs.
  - `downloader.ts`: Descarga segura de URLs con validación de Content-Type.
  - `imageProcessor.ts`: Herramientas para manipulación de imágenes previas al envío.
- `scripts/`: Scripts de automatización mejorados.
  - `setup.sh`: Instalación completa y configuración del servicio.
  - `manage.sh`: Comando unificado de gestión (start, stop, status, logs).
  - `run-local.sh`: Ejecución rápida sin instalación.

## 💻 Flujo de Desarrollo

1. **Instalación:**

   ```bash
   npm install
   ```

2. **Modo Observación (Development):**

   ```bash
   npm run dev
   ```

   Esto usa `tsx watch` para recargar el proxy automáticamente tras cada cambio.

3. **Pruebas:**
   Ejecuta las pruebas integrales antes de enviar un PR:

   ```bash
   node test/test-master.js
   ```

4. **Gestión Local:**
   Puedes usar `./scripts/manage.sh status` para verificar el estado de la API tras tus cambios.

5. **Build:**
   ```bash
   npm run build
   ```

## 📜 Estándares y Calidad

- **Clean Architecture:** Mantén las utilidades de bajo nivel en `utils/` y la lógica de integración en `services/`.
- **Zod:** Usamos Zod para validación de esquemas de configuración y respuestas.
- **Winston:** Usa el logger centralizado en `src/utils/logger.ts` para mantener la consistencia de los logs.

## ⚖️ Licencia

Al contribuir, aceptas que tus cambios estarán bajo la [Licencia MIT](./LICENSE).
