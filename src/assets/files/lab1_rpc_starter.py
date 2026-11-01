import asyncio
import json
import logging
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DistributedRPC")

class AsyncRPCServer:
    """Asynchronous Remote Procedure Call Server implementation for Lab 1."""
    
    def __init__(self, host: str = "127.0.0.1", port: int = 8080):
        self.host = host
        self.port = port
        self.registry: Dict[str, Any] = {}
        self._server: Optional[asyncio.Server] = None
        
    def register_method(self, name: str, handler):
        self.registry[name] = handler
        logger.info(f"Registered RPC method: {name}")

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        data = await reader.read(4096)
        try:
            req = json.loads(data.decode())
            method = req.get("method")
            params = req.get("params", {})
            req_id = req.get("id")
            
            if method in self.registry:
                res = await self.registry[method](**params)
                payload = json.dumps({"jsonrpc": "2.0", "result": res, "id": req_id})
            else:
                payload = json.dumps({"jsonrpc": "2.0", "error": f"Method {method} not found", "id": req_id})
        except Exception as e:
            payload = json.dumps({"jsonrpc": "2.0", "error": str(e), "id": None})
            
        writer.write(payload.encode())
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def start(self):
        self._server = await asyncio.start_server(self.handle_client, self.host, self.port)
        logger.info(f"RPC Server listening on {self.host}:{self.port}")
        async with self._server:
            await self._server.serve_forever()

if __name__ == "__main__":
    server = AsyncRPCServer()
    asyncio.run(server.start())
