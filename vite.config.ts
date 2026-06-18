import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, Plugin} from 'vite';

// A custom plugin to serve and bundle the root `model` folder statically
function serveModelFolder(): Plugin {
  return {
    name: 'serve-model-folder',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.startsWith('/model/')) {
          // Resolve request to the root 'model' directory
          const relativePath = decodeURIComponent(req.url.substring(7)); // strip '/model/'
          const filePath = path.resolve(__dirname, 'model', relativePath);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', getContentType(filePath));
            res.setHeader('Access-Control-Allow-Origin', '*'); // Enable CORS
            res.writeHead(200);
            res.end(fs.readFileSync(filePath));
            return;
          }
        }
        next();
      });
    },
    // Copy model files to build output folder (dist/) on production compilation
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'model');
      const destDir = path.resolve(__dirname, 'dist/model');
      if (fs.existsSync(srcDir)) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const files = fs.readdirSync(srcDir);
        for (const file of files) {
          const srcFile = path.join(srcDir, file);
          const destFile = path.join(destDir, file);
          if (fs.statSync(srcFile).isFile()) {
            fs.copyFileSync(srcFile, destFile);
          }
        }
      }
    }
  };
}

function getContentType(filePath: string) {
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.bin')) return 'application/octet-stream';
  return 'text/plain';
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serveModelFolder()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
