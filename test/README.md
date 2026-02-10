# 🧪 Suite de Pruebas - DeepSeek Multimodal Proxy

Esta carpeta contiene la suite de pruebas consolidada para verificar la funcionalidad multimodal y el routing inteligente del proxy.

## 🚀 Ejecución Rápida

La única herramienta que necesitas es la **Suite Maestra**:

```bash
# Inicia el proxy (si no está corriendo)
sudo systemctl start deepseek-proxy

# Ejecuta todas las pruebas
node test/test-master.js
```

## 📁 Estructura

```
test/
├── README.md           # Este archivo
├── test-master.js      # 👑 SUITE MAESTRA (Ejecuta todo)
└── files/              # Archivos de prueba reales del usuario
    ├── audio.mp3       # Audio de prueba
    ├── image.png       # Imagen de prueba
    ├── small-test.pdf  # PDF Pequeño (<1MB)
    ├── large-test.pdf  # PDF Mediano/Grande
    └── video.mp4       # Video de prueba
```

## 🔍 ¿Qué prueba la Suite Maestra?

`test-master.js` levanta un servidor HTTP temporal (puerto 8899) para servir los archivos locales y simular respuestas de tamaño, y luego ejecuta pruebas secuenciales contra el proxy (puerto 7777).

### Escenarios Verificados:

1.  **Health Check**: Verifica estado y versión del servicio.
2.  **Texto Simple**: Routing directo a DeepSeek (bypass de Gemini).
3.  **Imagen**: Routing a Gemini → DeepSeek.
4.  **Audio**: Routing a Gemini → DeepSeek (Input: `audio.mp3`).
5.  **Video**: Routing a Gemini → DeepSeek (Input: `video.mp4`).
6.  **PDF (Routing Inteligente)**:
    - **Pequeño (<1MB)**: Procesamiento Local → DeepSeek (usa `small-test.pdf`).
    - **Mediano (<1MB)**: Procesamiento Local (usa `large-test.pdf` si es <1MB).
    - **Grande (>1MB)**: Simulación de routing a Gemini (usa endpoint simulado `/large.pdf`).
7.  **Base64**: Imágenes inline (`data:image/...`) → Gemini.
8.  **Streaming**: Validación de respuesta en chunks (SSE) → Directo.

## 🛡️ Validación de Estrategia

El test verifica no solo que la respuesta sea exitosa (200 OK), sino que se haya usado la estrategia correcta mediante el header `X-Multimodal-Strategy` inyectado por el proxy.

| Tipo Contenido         | Estrategia Esperada | Razón                                                     |
| :--------------------- | :------------------ | :-------------------------------------------------------- |
| **Texto**              | `direct`            | Más rápido y barato.                                      |
| **Imagen/Audio/Video** | `gemini`            | Requiere capacidades multimodales nativas.                |
| **PDF < 1MB**          | `local`             | Privacidad y velocidad (procesado en el propio servidor). |
| **PDF > 1MB**          | `gemini`            | Aprovecha la ventana de contexto masiva de Gemini.        |

## ⚙️ Configuración Requerida (.env)

Asegúrate de tener definidas estas variables en tu archivo `.env` para que todas las pruebas pasen:

```ini
# API Key real para procesar multimodal
GEMINI_API_KEY=tu_api_key_de_google
GEMINI_MODEL=gemini-2.5-flash-lite

# Configuración de Routing de PDF
PDF_LOCAL_PROCESSING=true
PDF_LOCAL_MAX_SIZE_MB=1
```
