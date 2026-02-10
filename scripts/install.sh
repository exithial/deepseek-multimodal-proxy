#!/bin/bash
set -e

echo "🚀 Instalando DeepSeek Multimodal Proxy..."
echo ""

cd /home/exithial/Proyectos/deepseek-multimodal-proxy

# 1. Verificar Node.js
echo "📋 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no encontrado. Instala Node.js >= 18.0.0"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js $NODE_VERSION detectado. Se requiere >= 18.0.0"
    exit 1
fi

echo "✓ Node.js $(node -v) detectado"
echo ""

# 2. Instalar dependencias
echo "📦 Instalando dependencias..."
if command -v yarn &> /dev/null; then
    yarn install
else
    npm install
fi
echo ""

# 3. Compilar TypeScript
echo "🔨 Compilando TypeScript..."
if command -v yarn &> /dev/null; then
    yarn build
else
    npm run build
fi
echo ""

# 4. Crear directorio de caché
echo "📁 Creando directorio de caché..."
mkdir -p cache
echo ""

# 5. Configurar systemd del sistema
echo "⚙️ Configurando systemd del sistema..."
SERVICE_FILE="/etc/systemd/system/deepseek-proxy.service"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=DeepSeek Multimodal Proxy
After=network.target
Requires=network.target

[Service]
Type=simple
User=exithial
WorkingDirectory=/home/exithial/Proyectos/deepseek-multimodal-proxy
Environment="NODE_ENV=production"
Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/exithial/.nvm/versions/node/v24.13.0/bin"
ExecStart=/home/exithial/.nvm/versions/node/v24.13.0/bin/node /home/exithial/Proyectos/deepseek-multimodal-proxy/dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=deepseek-proxy

# Seguridad básica
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/home/exithial/Proyectos/deepseek-multimodal-proxy

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable deepseek-proxy
echo ""

# 6. Iniciar servicio
echo "🎬 Iniciando servicio del sistema..."
sudo systemctl start deepseek-proxy
echo ""

# 7. Verificar estado
sleep 2
echo "📊 Estado del servicio:"
sudo systemctl status deepseek-proxy --no-pager
echo ""

echo "✅ ¡Instalación completa como servicio del sistema!"
echo ""
echo "📝 Comandos útiles:"
echo "  sudo systemctl status deepseek-proxy    # Ver estado"
echo "  sudo systemctl restart deepseek-proxy   # Reiniciar"
echo "  sudo systemctl stop deepseek-proxy      # Detener"
echo "  sudo journalctl -u deepseek-proxy -f    # Ver logs en tiempo real"
echo ""
echo "🌐 El proxy está corriendo en: http://localhost:7777"
echo ""
echo "📖 Para integrar con OpenCode, agrega esto a ~/.config/opencode/opencode.json:"
echo ""
echo '  "provider": {'
echo '    "deepseek-multimodal": {'
echo '      "name": "DeepSeek Multimodal (Proxy)",'
echo '      "npm": "@ai-sdk/openai-compatible",'
echo '      "options": {'
echo '        "baseURL": "http://localhost:7777/v1",'
echo '        "apiKey": "not-needed"'
echo '      },'
echo '      "models": {'
echo '        "deepseek-multimodal-chat": {'
echo '          "name": "deepseek-multimodal-chat",'
echo '          "limit": { "context": 100000, "output": 8000 },'
echo '          "modalities": ["text", "image", "audio", "video", "document"]'
echo '        },'
echo '        "deepseek-multimodal-reasoner": {'
echo '          "name": "deepseek-multimodal-reasoner",'
echo '          "limit": { "context": 100000, "output": 64000 },'
echo '          "modalities": ["text", "image", "audio", "video", "document"]'
echo '        }'
echo '      }'
echo '    }'
echo '  }'
echo ""
