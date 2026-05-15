

# server.py - Veridian Backend con Groq
#
# INSTALACIÓN:
#   pip install flask flask-cors requests
#
# USO:
#   1. Pegá tu API key de Groq abajo
#   2. Corré: python server.py
#   3. Abrí index.html en el navegador

import re
import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# 👇 PEGÁ TU API KEY DE GROQ ACÁ
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

INSTRUCCION_NIVEL = {
    "basico": "El campo 'reason' debe ser MUY breve: máximo 5 palabras. Solo nombra el tipo de error. Ejemplo: 'falta tilde', 'error de concordancia', 'palabra unida'.",
    "intermedio": "El campo 'reason' debe explicar la regla general en una oración. Ejemplo: 'Las palabras agudas terminadas en vocal llevan tilde.'",
    "avanzado": "El campo 'reason' debe explicar en detalle la regla gramatical, su propósito y contexto. Puede tener 2-3 oraciones."
}

def get_prompt(nivel):
    instruccion = INSTRUCCION_NIVEL.get(nivel, INSTRUCCION_NIVEL["basico"])
    return f"""Sos un corrector de textos experto en español rioplatense.
Analizá el texto y devolvé ÚNICAMENTE un JSON válido, sin explicaciones ni bloques de código.

Estructura exacta:
{{
  "correcciones": [
    {{
      "id": "c1",
      "type": "correction",
      "original": "fragmento exacto del texto con error",
      "replacement": "fragmento corregido",
      "reason": "explicación según nivel"
    }}
  ],
  "sugerencias": [
    {{
      "id": "s1",
      "type": "suggestion",
      "original": "fragmento a mejorar",
      "replacement": "fragmento mejorado",
      "reason": "explicación según nivel"
    }}
  ],
  "texto_corregido": "texto completo con todas las correcciones aplicadas"
}}

Reglas:
- "correcciones": errores de ortografía, gramática, puntuación, acentos. Máximo 15.
- El campo "original" en correcciones debe contener ÚNICAMENTE la palabra con error, sin incluir palabras correctas adyacentes. Si el error involucra dos palabras juntas como "por que" → "porque", incluí ambas. Nunca más de eso.
- "sugerencias": mejoras de claridad o estructura. Máximo 8.
- El campo "original" en sugerencias puede ser una frase pero debe ser lo más corta posible.
- El campo "original" debe existir EXACTAMENTE igual en el texto, incluyendo mayúsculas, espacios y puntuación. Copiá el fragmento directamente del texto sin modificarlo. Si no podés copiarlo exactamente, no lo incluyas. Esto aplica tanto a correcciones como a sugerencias.
- Si no hay errores, devolvé arrays vacíos.
- IDs únicos: c1, c2... y s1, s2...
- NIVEL DE EXPLICACIÓN para el campo "reason": {instruccion}"""


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

    nivel = data.get('nivel', 'basico')
    prompt = get_prompt(nivel)

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
                    {"role": "system", "content": prompt},
                    {"role": "user",   "content": texto}
                ],
                "max_tokens": 4096,
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

