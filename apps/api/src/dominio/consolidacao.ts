import type {
  CampoDinamico,
  Competencia,
  Funcionario,
  Lancamento,
  VinculoCampo,
} from '@odontofolha/contracts';

export type SituacaoCelula = 'preenchido' | 'pendente' | 'nao_aplicavel';
export type CelulaConsolidada = {
  situacao: SituacaoCelula;
  valor: number | string | null;
  quantidadeParcelas: number;
};

export type LinhaConsolidada = {
  funcionario: Funcionario;
  celulas: Record<string, CelulaConsolidada>;
  totalAritmetico: number;
  parcial: boolean;
};

export type AbaEmpresa = {
  empresaContratanteId: string;
  funcionarios: LinhaConsolidada[];
  totaisMonetarios: Record<string, number>;
  totalSalarios: number;
  totalAritmetico: number;
  parcial: boolean;
};

export type Consolidacao = {
  competencia: Competencia;
  colunas: CampoDinamico[];
  abas: AbaEmpresa[];
};

export type DadosConsolidacao = {
  competencia: Competencia;
  funcionarios: Funcionario[];
  /** Fotografia das colunas pertencentes a esta competência. */
  camposDaCompetencia: CampoDinamico[];
  vinculosDaCompetencia: VinculoCampo[];
  lancamentosDaCompetencia: Lancamento[];
};

function chave(funcionarioId: string, campoId: string): string {
  return JSON.stringify([funcionarioId, campoId]);
}

function valorCentavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100);
}

function moeda(centavos: number): number {
  return centavos / 100;
}

function mesOrdenavel(competencia: Competencia): number {
  return competencia.ano * 12 + competencia.mes;
}

/**
 * A ausência de lançamento é diferente de zero informado e de funcionário não vinculado.
 * Quando um funcionário é desvinculado, lançamentos vigentes anteriores continuam
 * compondo a consolidação da competência (E0.58).
 */
function consolidarCelula(
  campo: CampoDinamico,
  registros: Lancamento[],
  vinculado: boolean,
): CelulaConsolidada {
  if (registros.length === 0) {
    return {
      situacao: vinculado ? 'pendente' : 'nao_aplicavel',
      valor: null,
      quantidadeParcelas: 0,
    };
  }

  const totais = registros.filter((item) => item.modo === 'total');
  const parcelas = registros.filter((item) => item.modo === 'parcela');

  if (totais.length > 1 || (totais.length > 0 && parcelas.length > 0)) {
    throw new Error('Célula com lançamentos diretos e parcelas vigentes incompatíveis');
  }

  if (parcelas.length > 0) {
    if (campo.tipo !== 'moeda' || parcelas.some((item) => typeof item.valor !== 'number')) {
      throw new Error('Parcelas só podem compor campos monetários');
    }
    const valor = moeda(
      parcelas.reduce((soma, item) => soma + valorCentavos(item.valor as number), 0),
    );
    return { situacao: 'preenchido', valor, quantidadeParcelas: parcelas.length };
  }

  const registro = totais[0];
  if (!registro) throw new Error('Forma de lançamento não reconhecida');
  if ((campo.tipo === 'moeda' || campo.tipo === 'percentual') && typeof registro.valor !== 'number') {
    throw new Error('Campo numérico recebeu um valor textual');
  }
  if ((campo.tipo === 'data' || campo.tipo === 'horario') && typeof registro.valor !== 'string') {
    throw new Error('Campo textual recebeu um valor numérico');
  }

  return { situacao: 'preenchido', valor: registro.valor, quantidadeParcelas: 0 };
}

/**
 * Consolidação aritmética, sem cálculos de encargos, descontos legais ou salário líquido.
 * Entradas e saídas já foram validadas pela fronteira de API antes da chamada.
 */
export function gerarConsolidacao(dados: DadosConsolidacao): Consolidacao {
  const { competencia, funcionarios, camposDaCompetencia, vinculosDaCompetencia, lancamentosDaCompetencia } =
    dados;

  const colunas = camposDaCompetencia
    .filter((campo) => mesOrdenavel(campo.criadoEm) <= mesOrdenavel(competencia))
    .sort((a, b) => a.ordemGlobal - b.ordemGlobal);

  const vinculados = new Set(vinculosDaCompetencia.map((item) => chave(item.funcionarioId, item.campoId)));
  const registrosPorCelula = new Map<string, Lancamento[]>();

  for (const lancamento of lancamentosDaCompetencia) {
    if (!lancamento.vigente) continue;
    const id = chave(lancamento.funcionarioId, lancamento.campoId);
    const anteriores = registrosPorCelula.get(id) ?? [];
    anteriores.push(lancamento);
    registrosPorCelula.set(id, anteriores);
  }

  const empresas = new Map<string, LinhaConsolidada[]>();
  for (const funcionario of funcionarios) {
    // Excluir imediatamente funcionários desligados de novos arquivos gerados.
    if (!funcionario.ativo) continue;

    const celulas: Record<string, CelulaConsolidada> = {};
    let totalEmCentavos = valorCentavos(funcionario.salarioContratual);
    let parcial = false;

    for (const campo of colunas) {
      const id = chave(funcionario.id, campo.id);
      const celula = consolidarCelula(
        campo,
        registrosPorCelula.get(id) ?? [],
        vinculados.has(id),
      );
      celulas[campo.id] = celula;
      if (celula.situacao === 'pendente') parcial = true;

      if (campo.tipo === 'moeda' && celula.situacao === 'preenchido') {
        if (typeof celula.valor !== 'number') throw new Error('Valor monetário inválido');
        const ajuste = valorCentavos(celula.valor);
        if (campo.classificacao === 'provento') totalEmCentavos += ajuste;
        if (campo.classificacao === 'desconto') totalEmCentavos -= ajuste;
      }
    }

    const linha: LinhaConsolidada = {
      funcionario,
      celulas,
      totalAritmetico: moeda(totalEmCentavos),
      parcial,
    };

    const anteriores = empresas.get(funcionario.empresaContratanteId) ?? [];
    anteriores.push(linha);
    empresas.set(funcionario.empresaContratanteId, anteriores);
  }

  const abas: AbaEmpresa[] = Array.from(empresas, ([empresaContratanteId, linhas]) => {
    const funcionariosOrdenados = linhas.sort((a, b) =>
      a.funcionario.nome.localeCompare(b.funcionario.nome, 'pt-BR', { sensitivity: 'base' }),
    );

    const totaisMonetarios: Record<string, number> = {};
    for (const campo of colunas) {
      if (campo.tipo !== 'moeda') continue;
      totaisMonetarios[campo.id] = moeda(
        funcionariosOrdenados.reduce((soma, linha) => {
          const celula = linha.celulas[campo.id];
          return soma + (celula?.situacao === 'preenchido' && typeof celula.valor === 'number'
            ? valorCentavos(celula.valor)
            : 0);
        }, 0),
      );
    }

    return {
      empresaContratanteId,
      funcionarios: funcionariosOrdenados,
      totaisMonetarios,
      totalSalarios: moeda(funcionariosOrdenados.reduce(
        (soma, linha) => soma + valorCentavos(linha.funcionario.salarioContratual), 0,
      )),
      totalAritmetico: moeda(funcionariosOrdenados.reduce(
        (soma, linha) => soma + valorCentavos(linha.totalAritmetico), 0,
      )),
      parcial: funcionariosOrdenados.some((linha) => linha.parcial),
    };
  });

  abas.sort((a, b) => a.empresaContratanteId.localeCompare(b.empresaContratanteId, 'pt-BR'));
  return { competencia, colunas, abas };
}
