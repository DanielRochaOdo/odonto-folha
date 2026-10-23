export type TipoMascaraNumerica = 'moeda' | 'percentual';

function textoNumerico(texto: string): string {
  return texto.replace(/R\$\s?/gi, '').replace(/%/g, '').replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
}

export function numeroDaMascara(texto: string): number {
  const limpo = textoNumerico(texto);
  if (!/\d/.test(limpo)) return Number.NaN;
  const normalizado = limpo.includes(',')
    ? limpo.replace(/\./g, '').replace(',', '.')
    : /^-?\d{1,3}(?:\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, '') : limpo;
  return Number(normalizado);
}

export function mascaraParaEdicao(texto: string): string {
  const limpo = textoNumerico(texto);
  if (!limpo.includes(',')) return /^-?\d{1,3}(?:\.\d{3})+$/.test(limpo)
    ? limpo.replace(/\./g, '') : limpo.replace('.', ',');
  const [inteiro = '', ...decimais] = limpo.replace(/\./g, '').split(',');
  return inteiro + ',' + decimais.join('').slice(0, 2);
}

export function mascaraDuranteDigitacao(
  texto: string, tipo: TipoMascaraNumerica,
): string {
  const possuiPrefixo = /R\$/i.test(texto) || texto.includes('%');
  let limpo = textoNumerico(texto);
  if (tipo === 'moeda' && (possuiPrefixo || (!limpo.includes(',') && !limpo.includes('.')))) {
    const digitos = limpo.replace(/\D/g, '');
    if (!digitos) return '';
    const negativo = limpo.startsWith('-') ? '-' : '';
    const centavos = digitos.padStart(3, '0');
    const inteiroSemZeros = centavos.slice(0, -2).replace(/^0+(?=\d)/, '') || '0';
    const inteiro = inteiroSemZeros.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'R$\u00a0' + negativo + inteiro + ',' + centavos.slice(-2);
  }
  if (limpo.includes(',')) limpo = limpo.replace(/\./g, '');
  else if (possuiPrefixo) limpo = limpo.replace(/\./g, '');
  else if (limpo.includes('.')) limpo = limpo.replace('.', ',');

  const negativo = limpo.startsWith('-') ? '-' : '';
  const partes = limpo.replace(/-/g, '').split(',');
  const digitos = (partes[0] ?? '').replace(/\D/g, '');
  if (!digitos && !limpo.includes(',')) return '';
  const inteiro = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const temDecimal = limpo.includes(',');
  const decimal = (partes.slice(1).join('').replace(/\D/g, '')).slice(0, 2);
  const numero = negativo + inteiro + (temDecimal ? ',' + decimal : '');
  return tipo === 'moeda' ? 'R$\u00a0' + numero : numero + '%';
}

export function mascaraFinal(texto: string, tipo: TipoMascaraNumerica): string {
  if (!texto.trim() || !textoNumerico(texto).trim()) return '';
  const valor = numeroDaMascara(texto);
  if (!Number.isFinite(valor)) return texto;
  return tipo === 'moeda'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
    : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(valor) + '%';
}

export function atualizarMascaraComCursor(
  input: HTMLInputElement, tipo: TipoMascaraNumerica,
): string {
  const original = input.value;
  const cursor = input.selectionStart ?? original.length;
  const digitosAntes = original.slice(0, cursor).replace(/\D/g, '').length;
  const mascarado = mascaraDuranteDigitacao(original, tipo);
  if (tipo === 'moeda') {
    const digitosDepois = original.slice(cursor).replace(/\D/g, '').length;
    let digitosRenderizados = 0;
    let posicao = mascarado.length;
    for (let i = 0; i < mascarado.length; i++) {
      if (/\d/.test(mascarado[i])) {
        if (digitosRenderizados >= Math.max(0,
          mascarado.replace(/\D/g, '').length - digitosDepois)) {
          posicao = i;
          break;
        }
        digitosRenderizados++;
      }
    }
    input.value = mascarado;
    window.requestAnimationFrame(() => {
      if (document.activeElement === input) input.setSelectionRange(posicao, posicao);
    });
    return mascarado;
  }
  const virgulaAntes = original.slice(0, cursor).includes(',');
  let posicao = 0;
  let vistos = 0;
  for (let i = posicao; i < mascarado.length; i++) {
    if (/\d/.test(mascarado[i])) vistos++;
    if (vistos >= digitosAntes && digitosAntes > 0) { posicao = i + 1; break; }
  }
  if (virgulaAntes) {
    const indiceVirgula = mascarado.indexOf(',');
    if (indiceVirgula >= 0 && posicao <= indiceVirgula) posicao = indiceVirgula + 1;
  }
  input.value = mascarado;
  window.requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(posicao, posicao);
  });
  return mascarado;
}

export function prepararMascaraParaEdicao(input: HTMLInputElement): string {
  const original = input.value;
  const cursor = input.selectionStart ?? original.length;
  const digitosAntes = original.slice(0, cursor).replace(/\D/g, '').length;
  const virgulaAntes = original.slice(0, cursor).includes(',');
  const texto = mascaraParaEdicao(input.value);
  let posicao = 0, vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i])) vistos++;
    if (vistos >= digitosAntes && digitosAntes > 0) { posicao = i + 1; break; }
  }
  if (virgulaAntes) {
    const indiceVirgula = texto.indexOf(',');
    if (indiceVirgula >= 0 && posicao <= indiceVirgula) posicao = indiceVirgula + 1;
  }
  input.value = texto;
  window.requestAnimationFrame(() => {
    if (document.activeElement === input) input.setSelectionRange(posicao, posicao);
  });
  return texto;
}
