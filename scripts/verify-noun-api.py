import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import api
from noun_postprocess import validate_input, validate_spans


class NounApiTest(unittest.TestCase):
    def setUp(self):
        self.payload = {'text': '街路樹や公園', 'tokens': [
            {'surface_form': surface, 'pos': pos, 'pos_detail_1': detail}
            for surface, pos, detail in [('街路', '名詞', '一般'), ('樹', '名詞', '接尾'), ('や', '助詞', '並立助詞'), ('公園', '名詞', '一般')]
        ]}
        self.client = api.app.test_client()

    def test_roundtrip(self):
        with patch.object(api, 'API_KEY', 'test'), patch.object(api, 'getgptdata', return_value='{"phrases":[{"token_ids":[0,1],"text":"街路樹"},{"token_ids":[3],"text":"公園"}]}') as model:
            response = self.client.post('/api/noun-phrases', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['nouns'], ['街路樹', '公園'])
        self.assertIn('pos_detail_1', model.call_args.args[0])

    def test_invalid_model_output(self):
        text, tokens = validate_input(self.payload)
        for result in ['not json', '{"phrases":[{"token_ids":[9],"text":"公園"}]}', '{"phrases":[{"token_ids":[1],"text":"樹"}]}', '{"phrases":[{"token_ids":[0,1],"text":"街路樹"},{"token_ids":[1,2],"text":"樹や"}]}', '{"phrases":[{"token_ids":[0,1],"text":"公園"}]}', '{"phrases":[{"token_ids":[3,4],"text":"公園は"}]}']:
            with self.subTest(result=result), patch.object(api, 'API_KEY', 'test'), patch.object(api, 'getgptdata', return_value=result):
                self.assertEqual(self.client.post('/api/noun-phrases', json=self.payload).status_code, 502)
        self.assertEqual(validate_spans(text, tokens, '{"phrases":[]}')['nouns'], [])

    def test_rejects_particle_boundary_without_losing_valid_phrase(self):
        text, tokens = validate_input(self.payload)
        result = validate_spans(text, tokens, '{"phrases":[{"token_ids":[0,1],"text":"街路樹"},{"token_ids":[2],"text":"や"}]}')
        self.assertEqual(result['nouns'], ['街路樹'])

    def test_invalid_input_and_missing_key(self):
        for payload in [None, {}, {'text': '別の文', 'tokens': self.payload['tokens']}]:
            self.assertEqual(self.client.post('/api/noun-phrases', json=payload).status_code, 400)
        with patch.object(api, 'API_KEY', ''):
            self.assertEqual(self.client.post('/api/noun-phrases', json=self.payload).status_code, 503)

    def test_upstream_error_does_not_leak(self):
        with patch.object(api, 'API_KEY', 'test'), patch.object(api, 'getgptdata', side_effect=RuntimeError('secret')):
            response = self.client.post('/api/noun-phrases', json=self.payload)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn('secret', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
