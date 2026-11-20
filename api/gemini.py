import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

KEY = os.environ.get("GEMINI_API_KEY")
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


class handler(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        try:
            if not KEY:
                return self._send(500, {"error": "GEMINI_API_KEY is not set on the server."})
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n))
            body = {"contents": [{"parts": req["parts"]}]}
            if req.get("json"):
                body["generationConfig"] = {"responseMimeType": "application/json"}
            if req.get("search"):
                body["tools"] = [{"google_search": {}}]
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
            r = urllib.request.Request(
                url,
                json.dumps(body).encode(),
                {"Content-Type": "application/json", "x-goog-api-key": KEY},
            )
            try:
                with urllib.request.urlopen(r, timeout=55) as resp:
                    d = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                msg = json.loads(e.read()).get("error", {}).get("message", "Gemini error")
                return self._send(e.code, {"error": msg})
            parts = (d.get("candidates") or [{}])[0].get("content", {}).get("parts", [])
            self._send(200, {"text": "".join(p.get("text", "") for p in parts)})
        except Exception as e:
            self._send(500, {"error": str(e)})
