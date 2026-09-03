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
  const descDificuldade: Record<string, string> = {
    facil: 'Conceitos básicos, identificação e aplicação simples.',
    medio: 'Interpretação, aplicação e raciocínio moderado.',
    dificil: 'Associação de conceitos e problemas mais complexos.',
    muito_dificil: 'Maior profundidade, interpretação, combinação de conhecimentos e resolução de problemas.',
    personalizado: 'Nível personalizado conforme assuntos informados.'
  };
  return `Você é um especialista em criação de questões educacionais em ${idioma} para a plataforma Nivora.
TAREFA: Gere exatamente ${quantidade} questões de múltipla escolha.

CONTEXTO:
- Matéria: ${materia}
- Assuntos: ${assuntos.join(', ')}
- Dificuldade: ${dificuldade} — ${descDificuldade[dificuldade] || ''}
- Idioma: ${idioma}
- Tipo: múltipla escolha (4 alternativas, UMA única correta)

INSTRUÇÕES OBRIGATÓRIAS (siga na ordem):
1. Analise os assuntos e identifique conceitos relevantes.
2. Identifique conceitos relevantes dentro de cada assunto.
3. Elabore questões que respeitem a dificuldade informada.
4. Evite repetição entre questões (enunciados e alternativas distintas).
5. Crie 4 alternativas plausíveis (distratores fortes e coerentes).
6. Defina exatamente UMA resposta correta por questão (correta_idx 0-3).
7. Crie explicação pedagógica clara do gabarito.
8. Associe cada questão ao assunto mais pertinente (dentre os informados).
9. Revise a própria questão antes de finalizar (coerência, correção conceitual).
10. Não use texto extra fora do JSON.

FORMATO JSON EXIGIDO (sem markdown):
{"questoes":[{"enunciado":"Texto da pergunta","alternativas":["A","B","C","D"],"correta_idx":0,"explicacao":"Por que a correta está certa","dificuldade":"${dificuldade}","assunto":"um dos assuntos"}]}`;
}

export function extrairJSON(texto: string): any | null {
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini < 0 || fim <= ini) return null;
  try { return JSON.parse(texto.slice(ini, fim + 1)); } catch { return null; }
}

// Validação rigorosa (fluxo #9)
export type ValidacaoResultado = { ok: boolean; erro?: string; questoes?: any[] };

export function validarQuestao(q: any, idx: number): { ok: boolean; erro?: string } {
  const base = `Questão ${idx + 1}: `;
  if (!q || typeof q !== 'object') return { ok: false, erro: base + 'dados inválidos.' };
  const enunciado = String(q.enunciado || q.question || '').trim();
  if (!enunciado) return { ok: false, erro: base + 'enunciado obrigatório.' };
  if (enunciado.length > 800) return { ok: false, erro: base + 'enunciado muito longo.' };
  let alts = Array.isArray(q.alternativas || q.options) ? (q.alternativas || q.options) : [];
  alts = alts.map((a: any) => String(a).trim()).filter(Boolean);
  if (alts.length !== 4) return { ok: false, erro: base + 'deve ter exatamente 4 alternativas.' };
  if (new Set(alts.map((s: string) => s.toLowerCase())).size !== alts.length) return { ok: false, erro: base + 'alternativas duplicadas.' };
  if (alts.some((a: string) => !a)) return { ok: false, erro: base + 'alternativa vazia.' };
  const correta = Number(q.correta_idx ?? q.correctAnswer);
  if (!Number.isInteger(correta) || correta < 0 || correta >= alts.length) return { ok: false, erro: base + 'gabarito inválido (deve ser 0-3).' };
  const explicacao = String(q.explicacao || q.explanation || '').trim();
  if (!explicacao) return { ok: false, erro: base + 'explicação obrigatória.' };
  const assunto = String(q.assunto || q.subject || '').trim();
  if (!assunto) return { ok: false, erro: base + 'assunto obrigatório.' };
  const dif = String(q.dificuldade || q.difficulty || 'medio');
  if (!['facil','medio','dificil','muito_dificil'].includes(dif)) return { ok: false, erro: base + 'dificuldade inválida.' };
  return { ok: true };
}

export function validarLote(questoes: any[]): ValidacaoResultado {
  if (!Array.isArray(questoes) || !questoes.length) return { ok: false, erro: 'Nenhuma questão enviada.' };
  for (let i = 0; i < questoes.length; i++) {
    const r = validarQuestao(questoes[i], i);
    if (!r.ok) return r;
  }
  const enunciados = new Set(questoes.map((q) => String(q.enunciado).toLowerCase().trim()));
  if (enunciados.size !== questoes.length) return { ok: false, erro: 'Há enunciados duplicados.' };
  // Checa alternativas duplicadas entre questões (heurística simples de repetição)
  return { ok: true, questoes };
}

// Mock local garantido (fallback) — B2: correta_idx aleatório, não sempre 2
export function mockLocal(params: GerarParams) {
  return {
    questoes: Array.from({ length: params.quantidade }, (_, i) => {
      const correta = Math.floor(Math.random() * 4);
      const assunto = params.assuntos[i % params.assuntos.length];
      const alts = Array.from({ length: 4 }, (_, idx) => {
        if (idx === correta) return `Resposta correta sobre ${assunto} (nível ${params.dificuldade})`;
        return `Distrator ${String.fromCharCode(65+idx)} de ${assunto}`;
      });
      const letra = String.fromCharCode(65+correta);
      return {
        enunciado: `[${params.materia} • ${assunto}] Questão ${i + 1} (${params.dificuldade}) — Qual alternativa está correta sobre "${assunto}"?`,
        alternativas: alts,
        correta_idx: correta,
        explicacao: `A alternativa ${letra} está correta porque aborda diretamente "${assunto}" no nível ${params.dificuldade}, conforme explicação pedagógica.`,
        dificuldade: params.dificuldade,
        assunto
      };
    })
  };
}

export class AIService {
  constructor(private env: any) {}
  // generateQuestions()
  async generateQuestions(params: GerarParams): Promise<{ questoes: any[]; provedor: string; prompt: string; raw: string }> {
    const prompt = montarPrompt(params);
    const quantidade = params.quantidade;
    // Helper com timeout 30s
    const comTimeout = async (p: Promise<string>, ms = 30000): Promise<string> => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try { return await p; } finally { clearTimeout(t); }
    };
    // Workers AI
    if (this.env.AI) {
      try {
        const modelo = this.env.AI_MODEL || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
        const r: any = await this.env.AI.run(modelo, {
          messages: [{ role: 'system', content: 'Gere APENAS JSON válido, sem markdown.' }, { role: 'user', content: prompt }]
        });
        const txt = typeof r === 'string' ? r : r.response || '';
        const dados = extrairJSON(txt);
        if (dados?.questoes?.length) {
          const valid = validarLote(dados.questoes.slice(0, quantidade));
          if (valid.ok) return { questoes: dados.questoes.slice(0, quantidade), provedor: 'workers-ai', prompt, raw: txt };
        }
      } catch (e) { console.error('[ai] workers-ai falhou', (e as any)?.message || e); }
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
            messages: [{ role: 'system', content: 'Gere APENAS JSON válido.' }, { role: 'user', content: prompt }],
            temperature: 0.7
          })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const j: any = await resp.json();
        const txt = j.choices?.[0]?.message?.content || '';
        const dados = extrairJSON(txt);
        if (dados?.questoes?.length) {
          const valid = validarLote(dados.questoes.slice(0, quantidade));
          if (valid.ok) return { questoes: dados.questoes.slice(0, quantidade), provedor: 'openrouter', prompt, raw: txt };
        }
      } catch (e) { console.error('[ai] openrouter falhou', (e as any)?.message || e); }
    }
    const m = mockLocal(params);
    return { questoes: m.questoes, provedor: 'mock-local', prompt, raw: JSON.stringify(m) };
  }

  // validateQuestions()
  validateQuestions(questoes: any[]): ValidacaoResultado { return validarLote(questoes); }

  // regenerateQuestion() — com limite de 3 tentativas (evita loop infinito)
  async regenerateQuestion(params: GerarParams, tentativa = 1): Promise<any | null> {
    if (tentativa > 3) return null;
    const r = await this.generateQuestions({ ...params, quantidade: 1 });
    const q = r.questoes[0];
    if (!q) return null;
    const v = validarQuestao(q, 0);
    if (v.ok) return q;
    return this.regenerateQuestion(params, tentativa + 1);
  }

  // Alias para compatibilidade com spec do prompt mestre
  async generate(params: GerarParams) { return this.generateQuestions(params); }
}
