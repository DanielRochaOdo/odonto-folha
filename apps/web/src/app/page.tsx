const verificacoes = [
  { titulo: 'Interface', estado: 'Estrutura inicial' },
  { titulo: 'API', estado: 'Endpoint técnico isolado' },
  { titulo: 'Persistência', estado: 'Aguardando configuração G2' },
  { titulo: 'Identidade', estado: 'Aguardando configuração G2' },
] as const;

export default function PaginaInicial() {
  return (
    <main className="layout">
      <div className="painel">
        <div className="topo">
          <span className="marca">OdontoFolha</span>
          <span className="ambiente">Fundação técnica · G1</span>
        </div>

        <div className="conteudo">
          <p className="sobretitulo">GRUPO ODONTOART · ENGENHARIA</p>
          <h1>Uma base consistente para evoluir.</h1>
          <p className="descricao">
            Esta é uma tela técnica provisória. O design system oficial e as funcionalidades
            de folha salarial ainda não foram implementados.
          </p>
          <section aria-label="Estado da fundação" className="lista">
            {verificacoes.map(({ titulo, estado }) => (
              <div className="item" key={titulo}>
                <span>{titulo}</span>
                <span className="estado">{estado}</span>
              </div>
            ))}
          </section>
          <p className="aviso">
            Nenhum dado pessoal é coletado ou apresentado por esta tela de demonstração.
          </p>
        </div>
      </div>
    </main>
  );
}
