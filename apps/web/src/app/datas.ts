export function formatarData(valor: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) return valor;

  const [, ano, mes, dia] = partes;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (data.toISOString().slice(0, 10) !== valor) return valor;

  return `${dia}/${mes}/${ano}`;
}
