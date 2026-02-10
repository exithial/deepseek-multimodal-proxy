#!/bin/bash
# Script para verificar estado del proxy

PORT="7777"
SERVICE_NAME="deepseek-proxy"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔍 Verificando estado de DeepSeek Multimodal Proxy...${NC}"
echo ""

# Verificar servicio systemd
echo -e "${BLUE}1. Servicio systemd:${NC}"
if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo -e "   ${GREEN}✅ Activo${NC}"
    echo -e "${YELLOW}   Estado detallado:${NC}"
    sudo systemctl status "$SERVICE_NAME" --no-pager --lines=5
else
    echo -e "   ${RED}❌ Inactivo${NC}"
fi
echo ""

# Verificar puerto
echo -e "${BLUE}2. Puerto $PORT:${NC}"
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ En uso${NC}"
    echo -e "${YELLOW}   Procesos usando el puerto:${NC}"
    lsof -i:$PORT
else
    echo -e "   ${RED}❌ Libre${NC}"
fi
echo ""

# Verificar health check
echo -e "${BLUE}3. Health check:${NC}"
if curl -s --max-time 5 http://localhost:$PORT/health > /dev/null 2>&1; then
    HEALTH=$(curl -s --max-time 5 http://localhost:$PORT/health)
    echo -e "   ${GREEN}✅ Respondiendo${NC}"
    echo "   Status: $(echo $HEALTH | jq -r '.status' 2>/dev/null || echo 'N/A')"
    echo "   Uptime: $(echo $HEALTH | jq -r '.uptime' 2>/dev/null || echo 'N/A')s"
    echo "   Service: $(echo $HEALTH | jq -r '.service' 2>/dev/null || echo 'N/A')"
else
    echo -e "   ${RED}❌ No responde${NC}"
fi
echo ""

# Verificar modelos
echo -e "${BLUE}4. Modelos disponibles:${NC}"
if curl -s --max-time 5 http://localhost:$PORT/v1/models > /dev/null 2>&1; then
    MODELS=$(curl -s --max-time 5 http://localhost:$PORT/v1/models)
    COUNT=$(echo $MODELS | jq '.data | length' 2>/dev/null || echo "0")
    if [ "$COUNT" -gt 0 ]; then
        echo -e "   ${GREEN}✅ $COUNT modelos${NC}"
        echo -e "${YELLOW}   Lista de modelos:${NC}"
        echo $MODELS | jq -r '.data[].id' 2>/dev/null | while read model; do
            echo "   • $model"
        done
    else
        echo -e "   ${YELLOW}⚠️  0 modelos (posible error)${NC}"
    fi
else
    echo -e "   ${RED}❌ No se pueden obtener modelos${NC}"
fi
echo ""

# Verificar logs recientes
echo -e "${BLUE}5. Logs recientes (últimas 5 líneas):${NC}"
if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    sudo journalctl -u "$SERVICE_NAME" -n 5 --no-pager 2>/dev/null || echo "   No se pueden obtener logs"
else
    echo "   Servicio no activo, no hay logs"
fi
echo ""

# Resumen
echo -e "${BLUE}📊 RESUMEN DEL ESTADO:${NC}"
echo "=========================="

# Servicio
if sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo -e "Servicio: ${GREEN}ACTIVO${NC}"
else
    echo -e "Servicio: ${RED}INACTIVO${NC}"
fi

# Puerto
if lsof -ti:$PORT > /dev/null 2>&1; then
    echo -e "Puerto $PORT: ${GREEN}EN USO${NC}"
else
    echo -e "Puerto $PORT: ${RED}LIBRE${NC}"
fi

# Health check
if curl -s --max-time 2 http://localhost:$PORT/health > /dev/null 2>&1; then
    echo -e "Health check: ${GREEN}OK${NC}"
else
    echo -e "Health check: ${RED}FALLIDO${NC}"
fi

# Modelos
if curl -s --max-time 2 http://localhost:$PORT/v1/models > /dev/null 2>&1; then
    COUNT=$(curl -s --max-time 2 http://localhost:$PORT/v1/models | jq '.data | length' 2>/dev/null || echo "0")
    echo -e "Modelos: ${GREEN}$COUNT disponibles${NC}"
else
    echo -e "Modelos: ${RED}NO DISPONIBLES${NC}"
fi

echo ""
echo -e "${BLUE}🔧 ACCIONES RECOMENDADAS:${NC}"
echo "=============================="

if ! sudo systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    echo "• Iniciar servicio: sudo systemctl start $SERVICE_NAME"
fi

if ! lsof -ti:$PORT > /dev/null 2>&1; then
    echo "• El puerto $PORT está libre, el proxy no está corriendo"
fi

if ! curl -s --max-time 2 http://localhost:$PORT/health > /dev/null 2>&1; then
    echo "• Verificar logs: sudo journalctl -u $SERVICE_NAME -f"
fi

echo ""
echo -e "${GREEN}✅ Verificación completada${NC}"