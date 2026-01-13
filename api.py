import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
import openai
from openai import OpenAI

# .envファイルの内容を読み込む
load_dotenv()
# .envファイルからAPIキーを取得
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

app = Flask(__name__)
CORS(app)  # CORS を有効化

# OpenAI APIを呼び出す関数
def getgptdata(mess):
    try:
        print("送信するプロンプト:", mess)  # デバッグ用ログ
        chat_completion = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": mess}
            ],
            max_tokens=500
        )
        data = chat_completion.choices[0].message.content
        print("受信したデータ:", data)  # デバッグ用ログ
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