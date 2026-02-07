# Middleware

Componentes de procesamiento intermedio para el pipeline de requests.

## `imageDetector.ts`

**Core del Proxy**: Detecta y procesa imágenes antes de que lleguen al controlador principal.

### Funcionalidad
1.  **Detección**: Escanea los mensajes del request (formato OpenAI) buscando:
    - `image_url` en contenido multipart.
    - Strings Base64 (`data:image/...`) embebidos en contenido texto.
2.  **Extracción de Contexto**: Analiza el texto del usuario ("¿Qué dice este recibo?") para enviarlo junto con la imagen al servicio de visión.
3.  **Procesamiento**:
    - Delega el análisis al servicio de visión configurado (`geminiService`).
    - **Sustitución**: Reemplaza la imagen original en el payload con la descripción textual generada.
    - Maneja concurrencia (procesa múltiples imágenes en paralelo).

### Flujo de Datos
```
Request Original [Texto + Imagen] 
       ↓ 
[Middleware Detector] 
       ↓ 
   (Tiene Imagen?) 
   No → Next() 
   Si → 
     1. Extraer Contexto
     2. GeminiService.analyze(img, context)
     3. Reemplazar Imagen por Texto
       ↓
Request Modificado [Texto + Descripción]
       ↓
Controlador (DeepSeek API)
```
