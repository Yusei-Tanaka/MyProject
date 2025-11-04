import os
from dotenv import load_dotenv
from openai import OpenAI

# .envファイルの内容を読み込む
load_dotenv()
# 環境変数からAPIキーを取得
api_key = os.getenv("OPENAI_API_KEY")

# OpenAIクライアントの初期化
client = OpenAI(api_key=api_key)

# ChatGPTに対してmessの内容を問い合わせ，結果を受け取る関数
def getgptdata(mess):
    chat_completion = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "system", "content": "You are a helpful assistant."},
                  {"role": "user", "content": mess}],
        max_tokens=500  # ここでトークン数を増やす
    )
    data = chat_completion.choices[0].message.content
    return data

# メイン処理の中で追加
if __name__ == "__main__":
    # ユーザー入力を取得
    prompt = input("質問を入力してください: ")

    # 各名詞に対してGPTへのメッセージを構築
    messa = f"以下の質問に答えてください: {prompt}"
    # GPTデータを取得
    result = getgptdata(messa)
    print(result)