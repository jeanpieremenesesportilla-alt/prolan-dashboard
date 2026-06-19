# ============================================================
# PROLAN Dashboard Enterprise V17 - Main Entry Point
# ============================================================

import os
import sys
import webview
from api import Api

def ruta_recursos(*partes):
    """Devuelve la ruta a un recurso empaquetado."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, *partes)

# Busca index.html en varias ubicaciones
candidatos = [
    ruta_recursos("frontend", "index.html"),
    ruta_recursos("index.html"),
]
RUTA_HTML = next((p for p in candidatos if os.path.exists(p)), candidatos[0])

def main():
    api = Api()
    window = webview.create_window(
        "PROLAN Dashboard Enterprise V17",
        RUTA_HTML,
        js_api=api,
        width=1400,
        height=860,
        min_size=(1100, 700),
        background_color="#0F172A",
        text_select=False,
    )
    webview.start(debug=False)

if __name__ == "__main__":
    main()
