# server.py - Veridian Backend con Groq
#
# INSTALACIÓN:
#   pip install flask flask-cors requests
#
# USO:
#   1. Pegá tu API key de Groq abajo
#   2. Corré: python server.py
#   3. Abrí index.html en el navegador

import os
import re
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# 👇 PEGÁ TU API KEY DE GROQ ACÁ
# Conseguila gratis en: console.groq.com
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

PROMPT = """Sos un corrector de textos experto en español rioplatense.
Analizá el texto y devolvé ÚNICAMENTE un JSON válido, sin explicaciones ni bloques de código.

Estructura exacta:
{
  "correcciones": [
    {
      "id": "c1",
      "type": "correction",
      "original": "fragmento exacto del texto con error",
      "replacement": "fragmento corregido",
      "reason": "explicación breve y clara"
    }
  ],
  "sugerencias": [
    {
      "id": "s1",
      "type": "suggestion",
      "original": "fragmento a mejorar",
      "replacement": "fragmento mejorado",
      "reason": "por qué mejora el texto"
    }
  ],
  "texto_corregido": "texto completo con todas las correcciones aplicadas"
}

Reglas:
- "correcciones": errores de ortografía, gramática, puntuación, acentos. Máximo 15.
- El campo "original" en correcciones debe contener ÚNICAMENTE la palabra con error, sin incluir palabras correctas adyacentes. Si el error involucra dos palabras juntas como "por que" → "porque", incluí ambas. Nunca más de eso.
- "sugerencias": mejoras de claridad o estructura. Máximo 8.
- El campo "original" en sugerencias puede ser una frase pero debe ser lo más corta posible.
- El campo "original" debe existir EXACTAMENTE igual en el texto, incluyendo mayúsculas, espacios y puntuación. Verificá caracter por caracter antes de incluirlo. Si no estás seguro, no lo incluyas.
- Si no hay errores, devolvé arrays vacíos.
- IDs únicos: c1, c2... y s1, s2...
- Explicaciones cortas, en español, sin tecnicismos."""


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/execute', methods=['POST', 'OPTIONS'])
def execute():
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Falta texto'}), 400

    texto = data['text'].strip()
    if not texto:
        return jsonify({'error': 'Texto vacío'}), 400

    try:
        resp = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": PROMPT},
                    {"role": "user",   "content": texto}
                ],
                "max_tokens": 2048,
               "temperature": 0
            },
            timeout=30
        )

        if resp.status_code != 200:
            raise Exception(f"Error Groq ({resp.status_code}): {resp.text}")

        raw = resp.json()['choices'][0]['message']['content'].strip()
        raw = re.sub(r'^```json\s*', '', raw)
        raw = re.sub(r'^```\s*',     '', raw)
        raw = re.sub(r'\s*```$',     '', raw)

        try:
            resultado = json.loads(raw)
        except json.JSONDecodeError:
            raw = re.sub(r',\s*}', '}', raw)
            raw = re.sub(r',\s*]', ']', raw)
            resultado = json.loads(raw)

        resultado.setdefault('correcciones',    [])
        resultado.setdefault('sugerencias',     [])
        resultado.setdefault('texto_corregido', texto)
        return jsonify(resultado)

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5000)))
