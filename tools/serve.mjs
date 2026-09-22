// Servidor estático mínimo para a pasta `dist`: `npm run jogar`.
//
// Existe porque o servidor de desenvolvimento do Vite (transformação por
// módulo, HMR, otimizador de dependências) foi morto pelo sistema por falta de
// memória nesta máquina. Este aqui não carrega o Vite nem nada além do http do
// próprio Node, e só entrega arquivos já prontos — sobra memória para o
// navegador, que é quem realmente precisa dela para rodar WebGL.
//
// A contrapartida: não recarrega sozinho. Depois de mexer no código é preciso
// rodar `npm run build` de novo.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` em vez de mexer no pathname na mão: no Windows o pathname de
// uma URL de arquivo vem como "/C:/..." com barras normais, e comparar isso com
// o caminho que `join` devolve (com contrabarras) nunca casa.
const ROOT = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const PORT = Number(process.argv[2] ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    // `normalize` + o prefixo obrigatório impedem sair da pasta com "..".
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^[\\/]+/, '');
    const file = resolve(join(ROOT, relative === '' ? 'index.html' : relative));

    if (!file.startsWith(ROOT)) {
      response.writeHead(403).end('Fora da pasta');
      return;
    }

    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Não encontrado');
  }
});

server.listen(PORT, () => {
  console.log(`\n  Jogo pronto em http://localhost:${PORT}/\n`);
});
