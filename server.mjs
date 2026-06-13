import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import netlify functions
import approvals from './netlify/functions/approvals.mjs';
import cleanupProjects from './netlify/functions/cleanup-projects.mjs';
import comments from './netlify/functions/comments.mjs';
import debugBlobs from './netlify/functions/debug-blobs.mjs';
import debugProject from './netlify/functions/debug-project.mjs';
import deleteProject from './netlify/functions/delete-project.mjs';
import finaliseProject from './netlify/functions/finalise-project.mjs';
import getAsset from './netlify/functions/get-asset.mjs';
import getPage from './netlify/functions/get-page.mjs';
import getProject from './netlify/functions/get-project.mjs';
import initProject from './netlify/functions/init-project.mjs';
import listProjects from './netlify/functions/list-projects.mjs';
import uploadFile from './netlify/functions/upload-file.mjs';
import uploadImages from './netlify/functions/upload-images.mjs';
import uploadProject from './netlify/functions/upload-project.mjs';
import uploadUrl from './netlify/functions/upload-url.mjs';

const app = express();
const PORT = process.env.PORT || 3001;

// Bridge Express request/response to web standard Request/Response
async function handleWebFunction(fn, req, res, params = {}) {
  try {
    const protocol = req.encrypted ? 'https' : 'http';
    const url = `${protocol}://${req.get('host')}${req.originalUrl}`;
    
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          headers.append(key, v);
        }
      } else if (val !== undefined) {
        headers.append(key, val);
      }
    }

    const init = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      init.body = Readable.toWeb(req);
      init.duplex = 'half';
    }

    const webReq = new Request(url, init);
    const context = {
      params,
    };

    const webRes = await fn(webReq, context);

    // Write headers
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.status(webRes.status);

    if (webRes.body) {
      const reader = webRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    console.error('Function execution error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
}

// Map endpoints
app.all('/api/approvals/:projectId', (req, res) => handleWebFunction(approvals, req, res, { projectId: req.params.projectId }));
app.all('/api/approvals', (req, res) => handleWebFunction(approvals, req, res));

app.all('/api/cleanup-projects', (req, res) => handleWebFunction(cleanupProjects, req, res));

app.all('/api/comments/:projectId', (req, res) => handleWebFunction(comments, req, res, { projectId: req.params.projectId }));
app.all('/api/comments', (req, res) => handleWebFunction(comments, req, res));

app.all('/api/debug-blobs', (req, res) => handleWebFunction(debugBlobs, req, res));
app.all('/api/debug-project', (req, res) => handleWebFunction(debugProject, req, res));

app.all('/api/project/:projectId', (req, res) => {
  if (req.method === 'DELETE') {
    return handleWebFunction(deleteProject, req, res, { projectId: req.params.projectId });
  }
  return handleWebFunction(getProject, req, res, { projectId: req.params.projectId });
});
app.all('/api/project', (req, res) => {
  if (req.method === 'DELETE') {
    return handleWebFunction(deleteProject, req, res);
  }
  return handleWebFunction(getProject, req, res);
});

app.all('/api/finalise-project', (req, res) => handleWebFunction(finaliseProject, req, res));

// Wildcard matches
app.all('/api/asset/:projectId/*', (req, res) => handleWebFunction(getAsset, req, res, { projectId: req.params.projectId }));
app.all('/api/page/:projectId/*', (req, res) => handleWebFunction(getPage, req, res, { projectId: req.params.projectId }));

app.all('/api/init-project', (req, res) => handleWebFunction(initProject, req, res));
app.all('/api/projects', (req, res) => handleWebFunction(listProjects, req, res));
app.all('/api/upload-file', (req, res) => handleWebFunction(uploadFile, req, res));
app.all('/api/upload-images', (req, res) => handleWebFunction(uploadImages, req, res));
app.all('/api/upload-project', (req, res) => handleWebFunction(uploadProject, req, res));
app.all('/api/upload-url', (req, res) => handleWebFunction(uploadUrl, req, res));

// In production, serve frontend build static files
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// For SPA routing, serve index.html for all other routes
app.get('*', async (req, res, next) => {
  try {
    const htmlPath = path.join(distPath, 'index.html');
    await fs.access(htmlPath);
    res.sendFile(htmlPath);
  } catch {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
