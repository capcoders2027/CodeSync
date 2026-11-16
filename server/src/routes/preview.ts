import http from 'http';
import { Router, Request, Response } from 'express';

export const previewRouter = Router();

function handleProxy(req: Request, res: Response) {
  const port = parseInt(req.params.port, 10);
  if (isNaN(port) || port < 1024 || port > 65535) {
    return res.status(400).json({ status: 'error', message: 'Invalid port. Must be between 1024 and 65535.' });
  }

  // Ensure CSP headers do not block inline scripts or asset loading in the preview proxy
  res.removeHeader('Content-Security-Policy');
  res.removeHeader('X-Content-Security-Policy');
  res.removeHeader('X-WebKit-CSP');

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
    const contentType = (resHeaders['content-type'] as string) || '';

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

    // Set cookie on root path so any sub-requests / static assets know which port to target
    res.cookie('codesync_preview_port', port.toString(), { path: '/', sameSite: 'lax' });

    // For HTML documents, rewrite root-relative links and inject <base> so assets like /static/style.css resolve correctly
    if (contentType.includes('text/html')) {
      const chunks: Buffer[] = [];
      proxyRes.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      proxyRes.on('end', () => {
        let html = Buffer.concat(chunks).toString('utf-8');

        // Rewrite root-relative URLs in HTML attributes: href="/...", src="/...", action="/..."
        html = html.replace(
          /((?:href|src|action)\s*=\s*["'])\/(?!\/|api\/preview\/)([^"']*["'])/gi,
          `$1/api/preview/${port}/$2`
        );

        // Inject <base> tag after <head> for any dynamic or relative assets
        if (/<head[^>]*>/i.test(html)) {
          html = html.replace(/(<head[^>]*>)/i, `$1\n  <base href="/api/preview/${port}/">`);
        }

        delete resHeaders['content-length'];
        resHeaders['content-length'] = Buffer.byteLength(html).toString();
        res.writeHead(proxyRes.statusCode || 200, resHeaders);
        res.end(html);
      });
      return;
    }

    res.writeHead(proxyRes.statusCode || 200, resHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err: any) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
      res.removeHeader('Content-Security-Policy');
      res.removeHeader('X-Content-Security-Policy');
      res.removeHeader('X-WebKit-CSP');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(502).send(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta http-equiv="refresh" content="3" />
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
              .spinner {
                display: inline-block;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(255,255,255,0.3);
                border-top-color: #38bdf8;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-left: 8px;
                vertical-align: middle;
              }
              @keyframes spin { to { transform: rotate(360deg); } }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Port ${port} Connecting... <span class="spinner"></span></h2>
              <p>Your web application is starting or not yet active on port <code>${port}</code>.</p>
              <p>Click <strong>▶ Run Project</strong> or run <code>python app.py</code> in the CodeSync terminal. This page will automatically refresh every 3 seconds.</p>
              <button id="reload-btn">Refresh Now</button>
            </div>
            <script>
              document.getElementById('reload-btn').addEventListener('click', function() {
                window.location.reload();
              });
            </script>
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
