// Gera `jogo.html`: o jogo inteiro em UM arquivo, para abrir com duplo clique.
// `npm run standalone`
//
// Por que isto existe: nesta máquina qualquer servidor local vive sendo morto
// por falta de memória, e sem servidor não há como abrir `localhost`. Um único
// HTML com tudo embutido tira o servidor da equação — o navegador abre o
// arquivo direto do disco.
//
// A pegadinha do file:// é que módulos ES são bloqueados por CORS mesmo vindo
// do próprio disco. Por isso o pacote sai em formato IIFE (script clássico) e
// não como módulo: um `<script type="module">` aqui não carregaria nunca.
// Pela mesma razão a textura do céu entra como data URI, e não como arquivo.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUTPUT = resolve(ROOT, 'jogo.html');

console.log('empacotando...');
const bundled = await build({
  entryPoints: [resolve(ROOT, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
});

let script = bundled.outputFiles[0].text;

// A textura do céu vira data URI. É o maior pedaço do arquivo, mas sem ela o
// céu fica na cor lisa do horizonte e todo o trabalho do HDR se perde.
const skyPng = readFileSync(resolve(ROOT, 'public/sky.png'));
const skyDataUri = `data:image/png;base64,${skyPng.toString('base64')}`;
const before = script.length;
script = script.split('"/sky.png"').join(JSON.stringify(skyDataUri));
if (script.length === before) {
  console.warn('  aviso: referência a /sky.png não encontrada no pacote');
}

const css = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8');
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');

// Troca o link da folha de estilo e a tag de módulo pelos conteúdos embutidos.
//
// A substituição usa FUNÇÃO em vez de string, e isso não é estilo: numa string
// de substituição, `$&` significa "o trecho que casou" e é expandido pelo
// próprio JavaScript. O pacote minificado contém `$&` literal (veio de dentro
// de alguma string do código), então a versão com string reinseria a tag
// `<script type="module">` no meio do pacote — e o arquivo gerado voltava a
// depender de um módulo que o `file://` não carrega, ficando com a tela preta.
// Passar uma função desliga toda essa expansão.
const page = html
  .replace(/\s*<link rel="stylesheet"[^>]*>/, () => `\n    <style>\n${css}\n    </style>`)
  .replace(
    /\s*<script type="module"[^>]*><\/script>/,
    () => `\n    <script>\n${script}\n    </script>`,
  );

if (page.includes('<script type="module"')) {
  throw new Error('A tag de módulo não foi substituída — o arquivo não abriria em file://');
}

writeFileSync(OUTPUT, page, 'utf8');
console.log(`pronto: ${OUTPUT} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
console.log('  abra com duplo clique — não precisa de servidor.');
