import os
from dotenv import load_dotenv
from openai import OpenAI

# .envファイルの内容を読み込む
load_dotenv()
# 環境変数からAPIキーを取得
api_key = os.getenv("OPENAI_API_KEY")

# OpenAIクライアントの初期化
client = OpenAI(api_key=api_key)

# OpenAI APIに質問を送信
chat_completion = client.chat.completions.create(
    messages=[
        {
            "role": "user",
            "content": "Hi there!",  # ユーザーからのメッセージ
        }
    ],
    model="gpt-4o-mini",  # 使用するモデル名
)
# 応答を取得して表示
response = chat_completion.choices[0].message.content
print(f"ChatGPT: {response}")
