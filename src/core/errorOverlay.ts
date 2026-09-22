/**
 * Mostra qualquer falha de inicialização NA TELA, em vez de deixar a página
 * preta e muda.
 *
 * Um jogo em canvas que quebra na primeira linha parece exatamente igual a um
 * jogo que não carregou, a um WebGL bloqueado e a um servidor fora do ar. Sem
 * isso, "não abre" é impossível de diagnosticar sem abrir o console.
 */
function render(title: string, detail: string, hint?: string): void {
  const existing = document.getElementById('fatal-error');
  if (existing) return;

  const box = document.createElement('div');
  box.id = 'fatal-error';
  box.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:9999',
    'display:flex',
    'flex-direction:column',
    'justify-content:center',
    'gap:14px',
    'padding:8vw',
    'background:#2b1b24',
    'color:#ffe3ee',
    'font:14px/1.6 ui-monospace,Consolas,monospace',
    'overflow:auto',
  ].join(';');

  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'font-size:22px;font-weight:700;color:#ff9ec4';
  box.appendChild(heading);

  const message = document.createElement('pre');
  message.textContent = detail;
  message.style.cssText =
    'white-space:pre-wrap;margin:0;padding:14px;background:rgba(0,0,0,.3);border-radius:8px';
  box.appendChild(message);

  if (hint) {
    const help = document.createElement('div');
    help.textContent = hint;
    help.style.cssText = 'color:#c7a8bb';
    box.appendChild(help);
  }

  document.body.appendChild(box);
}

/** Liga os coletores globais. Chame antes de qualquer outra coisa. */
export function installErrorOverlay(): void {
  window.addEventListener('error', (event) => {
    const error = event.error as Error | undefined;
    render(
      'O jogo quebrou ao carregar',
      error?.stack ?? event.message ?? 'Erro desconhecido',
      'Se isto aparecer, copie o texto acima — ele diz exatamente o que falhou.',
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as Error | undefined;
    render('Falha assíncrona', reason?.stack ?? String(event.reason));
  });
}

/** Reporta um erro capturado manualmente. */
export function reportFatal(error: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
  render('O jogo quebrou ao carregar', detail);
}

/**
 * Confere se o navegador realmente entrega um contexto WebGL.
 *
 * É a causa nº 1 de canvas preto: aceleração de hardware desligada, driver
 * antigo, ou o navegador desistindo por falta de memória. O erro do navegador
 * nesse caso é silencioso.
 */
export function checkWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const context =
      probe.getContext('webgl2') ??
      probe.getContext('webgl') ??
      probe.getContext('experimental-webgl');
    if (context) return true;
  } catch {
    // Cai no relatório abaixo.
  }

  render(
    'WebGL indisponível neste navegador',
    'O jogo precisa de WebGL para desenhar qualquer coisa, e este navegador não entregou um contexto.',
    'Verifique em chrome://gpu se a aceleração de hardware está ligada, ' +
      'ou abra chrome://settings/system e ative "Usar aceleração de hardware quando disponível". ' +
      'Memória livre baixa também faz o navegador recusar o contexto.',
  );
  return false;
}
