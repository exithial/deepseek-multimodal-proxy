#!/bin/bash
set -e

echo "🚀 Instalando DeepSeek Vision Proxy..."
echo ""

cd /home/exithial/.config/opencode/deepseek-vision-proxy

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

# 5. Configurar systemd
echo "⚙️ Configurando systemd..."
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/deepseek-proxy.service <<EOF
[Unit]
Description=DeepSeek Vision Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/exithial/.config/opencode/deepseek-vision-proxy
ExecStart=$(which node) /home/exithial/.config/opencode/deepseek-vision-proxy/dist/index.js
Restart=on-failure
RestartSec=10
Environment="NODE_ENV=production"

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable deepseek-proxy
echo ""

# 6. Iniciar servicio
echo "🎬 Iniciando servicio..."
systemctl --user start deepseek-proxy
echo ""

# 7. Verificar estado
sleep 2
echo "📊 Estado del servicio:"
systemctl --user status deepseek-proxy --no-pager
echo ""

echo "✅ ¡Instalación completa!"
echo ""
echo "📝 Comandos útiles:"
echo "  systemctl --user status deepseek-proxy    # Ver estado"
echo "  systemctl --user restart deepseek-proxy   # Reiniciar"
echo "  systemctl --user stop deepseek-proxy      # Detener"
echo "  journalctl --user -u deepseek-proxy -f    # Ver logs en tiempo real"
echo ""
echo "🌐 El proxy está corriendo en: http://localhost:7777"
echo ""
echo "📖 Para integrar con OpenCode, agrega esto a ~/.config/opencode/opencode.json:"
echo ""
echo '  "provider": {'
echo '    "deepseek": {'
echo '      "name": "DeepSeek con Visión (Proxy)",'
echo '      "npm": "@ai-sdk/openai-compatible",'
echo '      "options": {'
echo '        "baseURL": "http://localhost:7777/v1",'
echo '        "apiKey": "not-needed"'
echo '      },'
echo '      "models": {'
echo '        "deepseek-vision-chat": {'
echo '          "name": "deepseek-chat",'
echo '          "limit": { "context": 64000, "output": 8192 },'
echo '          "modalities": { "input": ["text", "image"], "output": ["text"] }'
echo '        },'
echo '        "deepseek-vision-reasoner": {'
echo '          "name": "deepseek-reasoner",'
echo '          "limit": { "context": 64000, "output": 8192 },'
echo '          "modalities": { "input": ["text", "image"], "output": ["text"] }'
echo '        }'
echo '      }'
echo '    }'
echo '  }'
echo ""
