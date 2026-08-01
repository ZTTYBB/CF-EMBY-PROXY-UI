import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

function normalizeBase(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return '/';

  if (/^https?:\/\//i.test(value)) {
    return value.endsWith('/') ? value : `${value}/`;
  }

  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function normalizeRoutePath(rawValue = '/admin') {
  const value = String(rawValue || '').trim();
  if (!value) return '/admin';
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized === '/' ? '/' : normalized.replace(/\/+$/, '');
}

function normalizeProxyTarget(rawValue = '') {
  const value = String(rawValue || '').trim();
  return value || 'http://127.0.0.1:8787';
}

function readRequestProtocol(request) {
  const forwardedProto = String(request?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (forwardedProto === 'https') return 'https';
  return request?.socket?.encrypted ? 'https' : 'http';
}

function rewriteDevProxyLocation(locationHeader = '', target = '', request) {
  const location = String(locationHeader || '').trim();
  const requestHost = String(request?.headers?.host || '').trim();
  if (!location || !requestHost) return location;

  try {
    const targetUrl = new URL(target);
    const nextUrl = new URL(location, targetUrl);
    if (nextUrl.origin !== targetUrl.origin) return location;
    nextUrl.protocol = `${readRequestProtocol(request)}:`;
    nextUrl.host = requestHost;
    return nextUrl.toString();
  } catch {
    return location;
  }
}

function rewriteDevProxySetCookieHeaders(setCookieHeader, request) {
  if (readRequestProtocol(request) === 'https' || !setCookieHeader) return setCookieHeader;
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return cookies.map((cookie) => String(cookie || '').replace(/;\s*Secure/gi, ''));
}

function createDevProxyRule(target) {
  return {
    target,
    changeOrigin: true,
    secure: false,
    ws: false,
    autoRewrite: true,
    configure(proxy) {
      proxy.on('proxyRes', (proxyRes, request) => {
        const nextLocation = rewriteDevProxyLocation(proxyRes.headers.location, target, request);
        if (nextLocation) {
          proxyRes.headers.location = nextLocation;
        }

        const nextSetCookie = rewriteDevProxySetCookieHeaders(proxyRes.headers['set-cookie'], request);
        if (nextSetCookie) {
          proxyRes.headers['set-cookie'] = nextSetCookie;
        }
      });
    }
  };
}

function createManualChunks() {
  return function manualChunks(id) {
    if (id.includes('node_modules/chart.js')) return 'vendor-chart';
    if (id.includes('node_modules/lucide-vue-next')) return 'vendor-icons';
    if (id.includes('node_modules/vue')) return 'vendor-vue';

    if (id.includes('/src/features/overview/')) return 'feature-overview';
    if (id.includes('/src/features/release/')) return 'feature-release';
    return null;
  };
}

function createDevProxy(env) {
  const adminPath = normalizeRoutePath(env.VITE_ADMIN_PATH || '/admin');
  const target = normalizeProxyTarget(env.VITE_DEV_PROXY_TARGET || env.VITE_API_BASE_URL);

  return {
    [adminPath]: createDevProxyRule(target),
    [`${adminPath}/`]: createDevProxyRule(target)
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: normalizeBase(env.VITE_CDN_BASE_URL),
    plugins: [
      vue(),
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    server: {
      fs: {
        allow: [fileURLToPath(new URL('..', import.meta.url))]
      },
      host: '0.0.0.0',
      port: 5173,
      proxy: createDevProxy(env)
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    },
    build: {
      target: 'es2022',
      manifest: true,
      sourcemap: true,
      cssCodeSplit: true,
      rolldownOptions: {
        output: {
          manualChunks: createManualChunks()
        }
      }
    }
  };
});
