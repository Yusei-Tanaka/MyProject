import os
import json
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
from openai import OpenAI

# .envファイルの内容を読み込む
load_dotenv()
# .envファイルからAPIキーを取得
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL_NAME = "gpt-4o-mini"
MAX_OUTPUT_TOKENS = 4000

app = Flask(__name__)
CORS(app)  # CORS を有効化

# OpenAI APIを呼び出す関数
def extract_response_text(response):
    if getattr(response, "output_text", None):
        return response.output_text

    parts = []
    for block in getattr(response, "output", []):
        if block.type != "message":
            continue
        for item in block.content or []:
            if item.type == "text":
                parts.append(item.text)
            elif item.type == "json":
                parts.append(json.dumps(item.json, ensure_ascii=False))
    return "\n".join(parts)


def getgptdata(mess):
    try:
        print("送信するプロンプト:", mess)  # デバッグ用ログ
        response = client.responses.create(
            model=MODEL_NAME,
            input=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": mess}
            ],
            temperature=0.2,
            max_output_tokens=MAX_OUTPUT_TOKENS
        )
        data = extract_response_text(response)
        print("受信したデータ:", data)  # デバッグ用ログ
        print("トークン使用量:", response.usage)  # プロンプト最適化用ログ
        return data
    except Exception as e:
        print("OpenAI APIエラー:", str(e))  # エラー内容をログに出力
        raise

@app.route('/api', methods=['POST'])
def handle_prompt():
    data = request.get_json()
    prompt = data.get('prompt', '')
    print("受信したプロンプト:", prompt)  # デバッグ用ログ
    try:
        # OpenAI APIを呼び出して結果を取得
        result = getgptdata(prompt)
        print("生成された結果:", result)  # デバッグ用ログ
        return jsonify({"result": result})
    except Exception as e:
        print("エラー発生:", str(e))  # エラー内容をログに出力だよ
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)