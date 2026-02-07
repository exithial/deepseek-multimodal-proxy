#!/bin/bash

cd /home/exithial/.config/opencode/deepseek-vision-proxy

echo "🚀 Iniciando DeepSeek Vision Proxy (modo manual)..."
echo ""

# Verificar si ya está corriendo con systemd
if systemctl --user is-active --quiet deepseek-proxy; then
    echo "⚠️ El servicio ya está corriendo con systemd"
    echo "Para detenerlo: systemctl --user stop deepseek-proxy"
    echo "Para ver logs: journalctl --user -u deepseek-proxy -f"
    exit 1
fi

# Iniciar en modo desarrollo (con watch)
if [ "$1" = "dev" ]; then
    echo "🔧 Modo desarrollo (auto-reload activado)"
    if command -v yarn &> /dev/null; then
        yarn dev
    else
        npm run dev
    fi
else
    # Verificar que esté compilado
    if [ ! -d "dist" ]; then
        echo "⚠️ Proyecto no compilado. Ejecutando build..."
        if command -v yarn &> /dev/null; then
            yarn build
        else
            npm run build
        fi
    fi

    # Iniciar en modo producción
    echo "🎯 Modo producción"
    if command -v yarn &> /dev/null; then
        yarn start
    else
        npm start
    fi
fi
