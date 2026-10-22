import type { Consolidacao } from './consolidacao';

export type NomesExportacao = { empresas: Record<string, string>; setores: Record<string, string> };
type Arquivo = { nome: string; conteudo: string };
const xml = (s: string) => s.split('').filter(ch => { const n = ch.charCodeAt(0); return n >= 32 || n === 9 || n === 10 || n === 13; }).join('')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const ref = (i: number): string => {
  let r = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) r = String.fromCharCode(65 + (n - 1) % 26) + r;
  return r;
};
const celulaTexto = (r: string, s: string, estilo = 0) =>
  '<c r="' + r + '" s="' + estilo + '" t="inlineStr"><is><t xml:space="preserve">' + xml(s) + '</t></is></c>';
const celulaNumero = (r: string, n: number, estilo = 0) => {
  if (!Number.isFinite(n)) throw new Error('Valor numérico não finito');
  return '<c r="' + r + '" s="' + estilo + '"><v>' + n + '</v></c>';
};
const celulaFormula = (r: string, f: string, n: number) =>
  '<c r="' + r + '" s="4"><f>' + f + '</f><v>' + n + '</v></c>';
function nome(mapa: Record<string, string>, chave: string): string {
  if (!mapa[chave]?.trim()) throw new Error('Empresa ou setor sem nome cadastrado');
  return mapa[chave];
}
function titulo(nomeOriginal: string, existentes: Set<string>): string {
  const base = [...nomeOriginal].map(ch => '\\/*?:[]'.includes(ch) ? ' ' : ch).join('').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Empresa';
  let valor = base;
  for (let n = 2; existentes.has(valor.toLowerCase()); n++) {
    const sufixo = ' (' + n + ')';
    valor = base.slice(0, 31 - sufixo.length) + sufixo;
  }
  existentes.add(valor.toLowerCase());
  return valor;
}
function checksum(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** ZIP STORE: produz XLSX sem dependência nova nem acesso ao Neon. */
function compactar(arquivos: Arquivo[]): Buffer {
  const partes: Buffer[] = [];
  const centrais: Buffer[] = [];
  let deslocamento = 0;
  if (arquivos.length > 65535) throw new Error('Quantidade de abas excede o limite ZIP');
  for (const { nome: caminho, conteudo } of arquivos) {
    const n = Buffer.from(caminho, 'utf8'), b = Buffer.from(conteudo, 'utf8');
    if (n.length > 65535 || b.length > 0xffffffff || deslocamento + b.length > 0xffffffff)
      throw new Error('XLSX ultrapassa o limite ZIP');
    const crc = checksum(b);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x800, 6);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(b.length, 18); l.writeUInt32LE(b.length, 22); l.writeUInt16LE(n.length, 26);
    partes.push(l, n, b);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8); c.writeUInt32LE(crc, 16); c.writeUInt32LE(b.length, 20);
    c.writeUInt32LE(b.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(deslocamento, 42);
    centrais.push(c, n);
    deslocamento += l.length + n.length + b.length;
  }
  const tamanho = centrais.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(tamanho, 12); fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, ...centrais, fim]);
}

const fixas = ['Empresa Contratante', 'Empresa Lotado', 'Setor de Lotação',
  'CPF', 'Nome', 'Cargo', 'Admissão', 'Salário Contratual'];
const estilos = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>',
  '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>',
  '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17425A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF277B90"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF278C78"/></patternFill></fill></fills>',
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>',
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
  '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/>',
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/>',
  '<xf numFmtId="0" fontId="1" fillId="4" borderId="0" xfId="0" applyFill="1" applyFont="1"/>',
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>',
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>',
].join('');

/**
 * E0: uma aba por contratante; oito fixas; dinâmicas na ordem global.
 * Pendente/não aplicável = branco; zero informado = numérico 0.
 * Fórmulas horizontais e verticais, recalculadas ao editar no Excel.
 */
export function gerarXlsx(dados: Consolidacao, nomes: NomesExportacao): Buffer {
  const empresas = [...dados.abas].sort((a, b) =>
    nome(nomes.empresas, a.empresaContratanteId).localeCompare(
      nome(nomes.empresas, b.empresaContratanteId), 'pt-BR'));
  if (!empresas.length) throw new Error('Nenhum vínculo ativo para exportar');
  const campos = [...dados.colunas].sort((a, b) => a.ordemGlobal - b.ordemGlobal);
  const arquivos: Arquivo[] = [], guias: string[] = [], usados = new Set<string>();
  for (const [i, aba] of empresas.entries()) {
    const tituloAba = titulo(nome(nomes.empresas, aba.empresaContratanteId), usados);
    guias.push('<sheet name="' + xml(tituloAba) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>');
    const headers = [...fixas, ...campos.map(c => c.grupoNome + ' — ' + c.nome), 'Total aritmético'];
    const ultima = ref(headers.length - 1);
    const linhas: string[] = ['<row r="1">' + headers.map((h, j) => celulaTexto(ref(j) + '1', h,
      j < 8 || j === headers.length - 1 ? 1 : campos[j - 8].origem === 'COMISSAO' ? 2 : 3)).join('') + '</row>'];
    const pessoas = [...aba.funcionarios].sort((a, b) =>
      a.funcionario.nome.localeCompare(b.funcionario.nome, 'pt-BR', { sensitivity: 'base' }));
    if (pessoas.length > 1048574) throw new Error('Limite de linhas Excel excedido');
    for (const [iLinha, linha] of pessoas.entries()) {
      const r = iLinha + 2, f = linha.funcionario;
      const valores = [nome(nomes.empresas, f.empresaContratanteId),
        nome(nomes.empresas, f.empresaLotadoId), nome(nomes.setores, f.setorLotacaoId),
        f.cpf, f.nome, f.cargo, f.admissao.slice(8, 10) + '/' +
        f.admissao.slice(5, 7) + '/' + f.admissao.slice(0, 4)];
      const cells = valores.map((v, j) => celulaTexto(ref(j) + r, v));
      cells.push(celulaNumero('H' + r, f.salarioContratual, 4));
      for (const [j, campo] of campos.entries()) {
        const valor = linha.celulas[campo.id];
        if (!valor || valor.situacao !== 'preenchido' || valor.valor === null) continue;
        const posicao = ref(8 + j) + r;
        if (typeof valor.valor === 'number') cells.push(celulaNumero(posicao,
          campo.tipo === 'percentual' ? valor.valor / 100 : valor.valor,
          campo.tipo === 'percentual' ? 5 : campo.tipo === 'moeda' ? 4 : 0));
        else cells.push(celulaTexto(posicao, valor.valor));
      }
      const proventos = ['H' + r, ...campos.flatMap((c, j) =>
        c.tipo === 'moeda' && c.classificacao === 'provento' ? [ref(8 + j) + r] : [])];
      const descontos = campos.flatMap((c, j) =>
        c.tipo === 'moeda' && c.classificacao === 'desconto' ? [ref(8 + j) + r] : []);
      const fTotal = 'SUM(' + proventos.join(',') + ')' +
        (descontos.length ? '-SUM(' + descontos.join(',') + ')' : '');
      cells.push(celulaFormula(ultima + r, fTotal, linha.totalAritmetico));
      linhas.push('<row r="' + r + '">' + cells.join('') + '</row>');
    }
    const fim = pessoas.length + 1, linhaTotal = fim + 1;
    const totais = [celulaTexto('A' + linhaTotal, aba.parcial ? 'TOTAL PARCIAL' : 'TOTAL', 1)];
    const colunasSoma = [7, ...campos.flatMap((c, j) => c.tipo === 'moeda' ? [j + 8] : []), headers.length - 1];
    for (const j of colunasSoma) {
      const coluna = ref(j);
      const total = j === 7 ? aba.totalSalarios
        : j === headers.length - 1 ? aba.totalAritmetico
          : aba.totaisMonetarios[campos[j - 8].id] ?? 0;
      totais.push(celulaFormula(coluna + linhaTotal, 'SUM(' + coluna + '2:' + coluna + fim + ')', total));
    }
    linhas.push('<row r="' + linhaTotal + '">' + totais.join('') + '</row>');
    arquivos.push({ nome: 'xl/worksheets/sheet' + (i + 1) + '.xml',
      conteudo: '<?xml version="1.0" encoding="UTF-8"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="17"/><cols><col min="1" max="' + headers.length +
      '" width="24" customWidth="1"/></cols><sheetData>' + linhas.join('') + '</sheetData>' +
      '<autoFilter ref="A1:' + ultima + fim + '"/></worksheet>',
    });
  }
  const rels = empresas.map((_, i) => '<Relationship Id="rId' + (i + 1) +
    '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('');
  const types = empresas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
    '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('');
  return compactar([
    { nome: '[Content_Types].xml', conteudo: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + types + '</Types>' },
    { nome: '_rels/.rels', conteudo: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { nome: 'xl/workbook.xml', conteudo: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + guias.join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { nome: 'xl/_rels/workbook.xml.rels', conteudo: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '<Relationship Id="rId' + (empresas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { nome: 'xl/styles.xml', conteudo: estilos },
    ...arquivos,
  ]);
}
