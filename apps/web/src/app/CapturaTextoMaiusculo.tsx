'use client';

import type { ChangeEvent, ReactNode } from 'react';

function capturarEmMaiusculas(evento: ChangeEvent<HTMLDivElement>) {
  const campo = evento.target;
  if (!(campo instanceof HTMLInputElement || campo instanceof HTMLTextAreaElement) ||
    campo.disabled || campo.readOnly) return;

  if (campo instanceof HTMLInputElement &&
    !['text', 'search', 'tel'].includes(campo.type)) return;

  if ((evento.nativeEvent as InputEvent).isComposing) return;

  const valorOriginal = campo.value;
  const valorMaiusculo = valorOriginal.toLocaleUpperCase('pt-BR');
  if (valorOriginal === valorMaiusculo) return;

  const inicio = campo.selectionStart;
  const fim = campo.selectionEnd;
  campo.value = valorMaiusculo;

  if (inicio !== null && fim !== null) {
    campo.setSelectionRange(
      valorOriginal.slice(0, inicio).toLocaleUpperCase('pt-BR').length,
      valorOriginal.slice(0, fim).toLocaleUpperCase('pt-BR').length,
    );
  }
}

export default function CapturaTextoMaiusculo({ children }: { children: ReactNode }) {
  return <div className="captura-texto-maiusculo" onChangeCapture={capturarEmMaiusculas}>
    {children}
  </div>;
}
