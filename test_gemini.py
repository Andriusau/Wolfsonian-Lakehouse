import urllib.request
import json
import os
import sys

key = open('.env').read().split('=')[1].strip()
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key={key}'

payload = {
    "contents": [
        {
            "role": "model",
            "parts": [{"text": "HELLO. I AM THE LAKEHOUSE ASSISTANT. SEARCH THE CATALOG USING NATURAL LANGUAGE OR KEYWORDS."}]
        },
        {
            "role": "user",
            "parts": [{"text": "Hi are we aliens"}]
        }
    ]
}

req = urllib.request.Request(url, method='POST', data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})

try:
    response = urllib.request.urlopen(req)
    print("SUCCESS")
    print(response.read().decode())
except urllib.error.HTTPError as e:
    print(f"HTTP Error {e.code}")
    print(e.read().decode())
