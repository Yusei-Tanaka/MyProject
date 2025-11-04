from flask import Flask, render_template, request
import requests

app = Flask(__name__)

def search_wikidata_entity(search_term, language='en'):
    url = "https://www.wikidata.org/w/api.php"
    params = {
        'action': 'wbsearchentities',
        'search': search_term,
        'language': language,
        'format': 'json',
        'limit': 1  # 必要に応じて取得件数を変更
    }
    
    response = requests.get(url, params=params)
    if response.status_code == 200:
        data = response.json()
        if 'search' in data and len(data['search']) > 0:
            return data['search'][0]['id']  # 最初のエンティティIDを返す
        else:
            return None
    else:
        return None

@app.route('/', methods=['GET', 'POST'])
def home():
    entity_id = None
    if request.method == 'POST':
        search_term = request.form['search_term']
        entity_id = search_wikidata_entity(search_term)
    return render_template('index.html', entity_id=entity_id)

if __name__ == '__main__':
    app.run(debug=True)
