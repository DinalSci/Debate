import base64
import json
import os
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler

FOLDER = os.environ.get("DRIVE_FOLDER_ID")
CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
REFRESH = os.environ.get("GOOGLE_REFRESH_TOKEN")


def access_token():
    data = urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": REFRESH,
        "grant_type": "refresh_token",
    }).encode()
    with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data)) as r:
        return json.loads(r.read())["access_token"]


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
            if not (FOLDER and CLIENT_ID and CLIENT_SECRET and REFRESH):
                return self._send(500, {"error": "Drive variables are not set on the server."})
            n = int(self.headers.get("Content-Length", 0))
            req = json.loads(self.rfile.read(n))
            raw = base64.b64decode(req["data"])
            mime = req.get("mime") or "application/octet-stream"
            b = uuid.uuid4().hex
            meta = json.dumps({"name": req["name"], "parents": [FOLDER]})
            body = (
                f"--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
                f"--{b}\r\nContent-Type: {mime}\r\n\r\n"
            ).encode() + raw + f"\r\n--{b}--".encode()
            r = urllib.request.Request(
                "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name",
                body,
                {"Authorization": "Bearer " + access_token(), "Content-Type": f"multipart/related; boundary={b}"},
            )
            with urllib.request.urlopen(r, timeout=55) as resp:
                self._send(200, json.loads(resp.read()))
        except Exception as e:
            self._send(500, {"error": str(e)})
