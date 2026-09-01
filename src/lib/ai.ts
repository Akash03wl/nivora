/**
 * NIVORA — Camada de IA (abstração)
 * AIService com providers trocáveis. Nunca salvar questão incompleta como válida.
 */

export type GerarParams = {
  materia: string;
  assuntos: string[];
  dificuldade: string;
  quantidade: number;
  idioma?: string;
};

export function montarPrompt({ materia, assuntos, dificuldade, quantidade, idioma = 'pt-BR' }: GerarParams): string {
  return `Você é especialista em criação de questões educacionais em ${idioma}.
Gere exatamente ${quantidade} questões de múltipla escolha (4 alternativas, UMA correta).
Matéria: ${materia}
Assuntos: ${assuntos.join(', ')}
Dificuldade: ${dificuldade}
Responda APENAS JSON válido sem markdown:
{"questoes":[{"enunciado":"...","alternativas":["A","B","C","D"],"correta_idx":0,"explicacao":"...","dificuldade":"${dificuldade}","assunto":"..."}]}`;
}

export function extrairJSON(texto: string): any | null {
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fim + 1)); } catch { return null; }
}

// Mock local garantido (fallback)
export function mockLocal(params: GerarParams) {
  return {
    questoes: Array.from({ length: params.quantidade }, (_, i) => ({
      enunciado: `[${params.materia} • ${params.assuntos[i % params.assuntos.length]}] Questão ${i + 1} (${params.dificuldade})`,
      alternativas: ['Alternativa A', 'Alternativa B', 'Alternativa C (correta)', 'Alternativa D'],
      correta_idx: 2,
      explicacao: `Resposta C — aborda ${params.assuntos[i % params.assuntos.length]} no nível ${params.dificuldade}.`,
      dificuldade: params.dificuldade,
      assunto: params.assuntos[i % params.assuntos.length]
    }))
  };
}

export class AIService {
  constructor(private env: any) {}
  async generate(params: GerarParams) {
    const prompt = montarPrompt(params);
    // Workers AI
    if (this.env.AI) {
      try {
        const modelo = this.env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
        const r: any = await this.env.AI.run(modelo, {
          messages: [{ role: 'system', content: 'Gere APENAS JSON válido.' }, { role: 'user', content: prompt }]
        });
        const txt = typeof r === 'string' ? r : r.response || '';
        const dados = extrairJSON(txt);
        if (dados?.questoes?.length) return { questoes: dados.questoes.slice(0, params.quantidade), provedor: 'workers-ai', prompt, raw: txt };
      } catch (e) { console.error('[ai] workers-ai falhou', e); }
    }
    // OpenRouter / Gemini
    if (this.env.AI_API_KEY) {
      try {
        const url = (this.env.AI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '') + '/chat/completions';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.env.AI_API_KEY}` },
          body: JSON.stringify({
            model: this.env.AI_MODEL || 'google/gemini-2.0-flash-001',
            messages: [{ role: 'system', content: 'Gere APENAS JSON.' }, { role: 'user', content: prompt }],
            temperature: 0.7
          })
        });
        const j: any = await resp.json();
        const txt = j.choices?.[0]?.message?.content || '';
        const dados = extrairJSON(txt);
        if (dados?.questoes?.length) return { questoes: dados.questoes.slice(0, params.quantidade), provedor: 'openrouter', prompt, raw: txt };
      } catch (e) { console.error('[ai] openrouter falhou', e); }
    }
    const m = mockLocal(params);
    return { questoes: m.questoes, provedor: 'mock-local', prompt, raw: JSON.stringify(m) };
  }
}
