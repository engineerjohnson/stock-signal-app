import urllib.request
import json
import sys

url = 'https://api.github.com/repos/engineerjohnson/stock-signal-app/actions/workflows/258886358/dispatches'
headers = {
    'Authorization': 'token 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',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
}
data = json.dumps({'ref': 'main'}).encode('utf-8')

req = urllib.request.Request(url, data=data, headers=headers, method='POST')
try:
    with urllib.request.urlopen(req) as response:
        status = response.status
        body = response.read().decode('utf-8')
        print(f'HTTP Status Code: {status}')
        print(f'Response Body: {body if body else "(empty)"}')
except urllib.error.HTTPError as e:
    print(f'HTTP Status Code: {e.code}')
    body = e.read().decode('utf-8')
    print(f'Response Body: {body}')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
