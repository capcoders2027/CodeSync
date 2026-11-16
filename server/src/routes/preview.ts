import http from 'http';
import { Router, Request, Response } from 'express';

export const previewRouter = Router();

function handleProxy(req: Request, res: Response) {
  const port = parseInt(req.params.port, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    return res.status(400).json({ status: 'error', message: 'Invalid port. Must be between 1024 and 65535.' });
  }

  // Ensure trailing slash for root preview URL so relative HTML assets load correctly
  if (req.originalUrl === `/api/preview/${port}`) {
    return res.redirect(301, `/api/preview/${port}/`);
  }

  const prefix = `/api/preview/${port}`;
  let targetPath = req.originalUrl.startsWith(prefix)
    ? req.originalUrl.slice(prefix.length)
    : req.url;

  if (!targetPath || !targetPath.startsWith('/')) {
    targetPath = '/' + (targetPath || '');
  }

  const headers = { ...req.headers };
  headers.host = `127.0.0.1:${port}`;
  delete headers['accept-encoding'];

  const options: http.RequestOptions = {
    hostname: '127.0.0.1',
    port,
    path: targetPath,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const resHeaders = { ...proxyRes.headers };
    // Rewrite redirects so browser remains inside /api/preview/:port
    if (resHeaders.location) {
      let loc = resHeaders.location;
      if (loc.startsWith(`http://127.0.0.1:${port}`)) {
        loc = loc.replace(`http://127.0.0.1:${port}`, `/api/preview/${port}`);
      } else if (loc.startsWith(`http://localhost:${port}`)) {
        loc = loc.replace(`http://localhost:${port}`, `/api/preview/${port}`);
      } else if (loc.startsWith('/')) {
        loc = `/api/preview/${port}${loc}`;
      }
      resHeaders.location = loc;
    }

    res.writeHead(proxyRes.statusCode || 200, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      return res.status(502).send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <title>Web Preview · Port ${port}</title>
            <style>
              body {
                background: #090d16;
                color: #f1f5f9;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                padding: 20px;
                box-sizing: border-box;
                text-align: center;
              }
              .card {
                background: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 12px;
                padding: 32px;
                max-width: 500px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
              }
              h2 { color: #f87171; margin-top: 0; }
              p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
              code { background: #1e293b; color: #38bdf8; padding: 3px 6px; border-radius: 4px; font-size: 13px; }
              button {
                margin-top: 16px;
                background: #2563eb;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
              }
              button:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Port ${port} Not Active Yet</h2>
              <p>Your web application is not listening on port <code>${port}</code> right now.</p>
              <p>Run your project in CodeSync terminal (e.g. <code>python app.py</code>) and wait for the server to start, then refresh this page.</p>
              <button onclick="window.location.reload()">Refresh Preview</button>
            </div>
          </body>
        </html>
      `);
    }

    res.status(500).json({ status: 'error', message: `Proxy error: ${err.message}` });
  });

  // If express.json() or express.urlencoded() already buffered the body, write it directly
  if (req.body && Object.keys(req.body).length > 0) {
    const contentType = (req.headers['content-type'] as string) || '';
    let bodyData: string | undefined;
    if (contentType.includes('application/json')) {
      bodyData = JSON.stringify(req.body);
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      bodyData = new URLSearchParams(req.body as any).toString();
    }
    if (bodyData) {
      options.headers = options.headers || {};
      options.headers['content-length'] = Buffer.byteLength(bodyData);
      proxyReq.write(bodyData);
      proxyReq.end();
      return;
    }
  }

  req.pipe(proxyReq);
}

previewRouter.all('/:port', handleProxy);
previewRouter.all('/:port/*', handleProxy);
