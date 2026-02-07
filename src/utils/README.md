# Utilidades del Sistema

Módulos transversales de soporte.

## `logger.ts`
Sistema de logging centralizado basado en Winston. Gestiona niveles de log (info, error, debug) y rotación de archivos.

## `hashGenerator.ts`
Generación de hashes criptográficos para el sistema de caché.
- `generateContextualHash(image, context)`: Crea un identificador único combinando el contenido binario de la imagen y la pregunta del usuario.

## `imageProcessor.ts`
Utilidades para manipulación y validación de imágenes.
- Soporte para fuentes: Base64, URL remota, Archivo local.
- Conversión y normalización de formatos.
- Validación de límites de tamaño.

## `error.ts`
Utilidades para manejo seguro de errores en TypeScript.
- `getErrorMessage(error: unknown)`: Extrae mensajes legibles de cualquier tipo de excepción lanzada.
