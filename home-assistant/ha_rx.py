import http.server, json, sys
R='/Users/davidmackinnon/tradingview-mcp-jackson/home-assistant/'
class H(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('Access-Control-Allow-Private-Network','true')
    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()
    def do_POST(self):
        n=int(self.headers['Content-Length']); b=json.loads(self.rfile.read(n))
        for k,v in b.items():
            json.dump(v, open(R+k+'.json','w'), indent=2)
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'saved '+','.join(b).encode())
        sys.stdout.write('saved '+','.join(b)+'\n'); sys.stdout.flush()
        raise SystemExit
    def log_message(self,*a): pass
s=http.server.HTTPServer(("127.0.0.1",8765),H)
import signal; signal.alarm(120)
while True: s.handle_request()
