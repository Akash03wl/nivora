import { AIService } from '../src/lib/ai.js';
import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import app from '../src/index.js';
import { checar } from '../src/lib/rateLimit.js';
let sqlite: DatabaseSync;
let db: any;
beforeEach(() => {
 sqlite = new DatabaseSync(':memory:');
 for (const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync('migrations/'+f,'utf8'));
 const prepared = (sql:string, params:any[] = []):any => ({
  bind: (...p:any[]) => prepared(sql,p),
  first: (col?:string) => { const row:any=sqlite.prepare(sql).get(...params); return row ? (col?row[col]:row) : null; },
  all: () => ({results:sqlite.prepare(sql).all(...params)}),
  run: () => ({meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}})
 });
 db={prepare:prepared,batch:(statements:any[])=> { sqlite.exec('BEGIN');try {const r=statements.map(s=>s.run());sqlite.exec('COMMIT');return r;}catch(e){sqlite.exec('ROLLBACK');throw e;} }};
});
function req(route:string,method='GET',body?:any,cookie='',env:any={},headers:any={}) {
 return app.fetch(new Request('http://test/api/'+route,{method,headers:{'Content-Type':'application/json',Cookie:cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB:db,ENVIRONMENT:'development',...env});
}
async function register(nick:string,env:any={}) {const r=await req('auth/register','POST',{nick,email:nick+'@example.test',senha:'Ficticia123!'},'',env);expect(r.status).toBe(201);return {cookie:r.headers.get('set-cookie')!.split(';')[0],user:(await r.json() as any).usuario};}
async function room() {const admin=await register('admin');const r=await req('rooms','POST',{nome:'Regressão',assuntos:['Soma'],quantidade:5,tempo_por_questao:30},admin.cookie);expect(r.status).toBe(201);return {admin,id:(await r.json() as any).room.id};}
describe('Auditoria NIVORA — regressões',()=>{
 it('cadastro público em produção não concede ADMIN nem ao primeiro nem ao email configurado',async()=>{
  const a=await register('primeiro',{ENVIRONMENT:'production'});expect(a.user.papel).toBe('USER');
  const b=await register('reservado',{ENVIRONMENT:'production',ADMIN_EMAIL:'reservado@example.test'});expect(b.user.papel).toBe('USER');
  expect((await req('auth/admin/ping','GET',undefined,b.cookie)).status).toBe(403);
 });
 it('filtro de status não contorna autorização de rascunhos',async()=>{
  const {admin}=await room();
  expect((await (await req('rooms?status=DRAFT')).json() as any).rooms).toHaveLength(0);
  expect((await (await req('rooms?status=DRAFT','GET',undefined,admin.cookie)).json() as any).rooms).toHaveLength(1);
 });
 it('cookie malformado retorna 401 e não erro interno',async()=>{expect((await req('auth/me','GET',undefined,'nivora_sessao=%ZZ')).status).toBe(401);});
 it.each([null,[],42,'texto'])('rejeita JSON sem objeto: %s',async(body)=>{expect((await req('auth/register','POST',body)).status).toBe(400);});
 it('limita corpo e recusa origem externa',async()=>{
  expect((await req('auth/register','POST',{nick:'x'.repeat(20000)})).status).toBe(413);
  expect((await req('auth/logout','POST',{},'',{}, {Origin:'https://outro.example'})).status).toBe(403);
 });
 it('não expõe gabarito de sala fechada que pode ser reaberta',async()=>{
  const {admin,id}=await room();await req(`rooms/${id}/generate`,'POST',{},admin.cookie);
  sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('CLOSED',id);
  const j:any=await (await req(`rooms/${id}/questions`)).json();
  expect(j.questoes).toHaveLength(5);expect(j.questoes[0].correta_idx).toBeUndefined();expect(j.questoes[0].explicacao).toBeUndefined();
 });
 it('pular com null não vira alternativa A e retomada preserva relógio',async()=>{
  const {admin,id}=await room();await req(`rooms/${id}/generate`,'POST',{},admin.cookie);
  sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('ACTIVE',id);
  const user=await register('aluno');const start:any=await (await req(`rooms/${id}/start`,'POST',{},user.cookie)).json();
  const again:any=await (await req(`rooms/${id}/start`,'POST',{},user.cookie)).json();
  expect(again.attempt.iniciado_em).toBe(start.attempt.iniciado_em);expect(again.attempt.ultima_resposta_em).toBe(start.attempt.ultima_resposta_em);
  const q=start.questoes[0];await req(`rooms/${id}/answer`,'POST',{question_id:q.id,alternativa_idx:null},user.cookie);
  const answer:any=sqlite.prepare('SELECT alternativa_idx,correta FROM answers WHERE question_id=?').get(q.id);
  expect(answer.alternativa_idx).toBeNull();expect(answer.correta).toBe(0);
 });
 it('limite resiste a requisições concorrentes',async()=>{
  const r=await Promise.all(Array.from({length:20},()=>checar(db,new Request('http://test'),'concorrencia',5,60)));
  expect(r.filter(x=>x.ok)).toHaveLength(5);
 });
 it('ações de administração não dependem de handlers inline bloqueados pela CSP',()=>{
  expect(fs.readFileSync('public/js/app.js','utf8')).not.toMatch(/onclick=/);
  expect(fs.readFileSync('public/index.html','utf8')).not.toMatch(/onclick=/);
 });
});

describe('Transações e concorrência',()=>{
 it('cada resposta atualiza o início da próxima questão no mesmo commit',async()=>{
  const {admin,id}=await room();await req(`rooms/${id}/generate`,'POST',{},admin.cookie);
  sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('ACTIVE',id);
  const user=await register('relogio');const start:any=await (await req(`rooms/${id}/start`,'POST',{},user.cookie)).json();
  const old=new Date(Date.now()-20000).toISOString();
  sqlite.prepare('UPDATE attempts SET ultima_resposta_em=? WHERE id=?').run(old,start.attempt.id);
  const first=await req(`rooms/${id}/answer`,'POST',{question_id:start.questoes[0].id,alternativa_idx:0},user.cookie);
  expect(first.status).toBe(200);expect((await first.json() as any).tempoServidor).toBeGreaterThanOrEqual(20);
  const att:any=sqlite.prepare('SELECT ultima_resposta_em FROM attempts WHERE id=?').get(start.attempt.id);
  expect(Date.parse(att.ultima_resposta_em)).toBeGreaterThan(Date.parse(old));
  const second=await req(`rooms/${id}/answer`,'POST',{question_id:start.questoes[1].id,alternativa_idx:0},user.cookie);
  expect(second.status).toBe(200);expect((await second.json() as any).tempoServidor).toBeLessThan(5);
 });
 it('falha ao avançar relógio também desfaz a resposta',async()=>{
  const {admin,id}=await room();await req(`rooms/${id}/generate`,'POST',{},admin.cookie);
  sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('ACTIVE',id);
  const user=await register('rollback');const start:any=await (await req(`rooms/${id}/start`,'POST',{},user.cookie)).json();
  sqlite.exec("CREATE TRIGGER audit_clock_fail BEFORE UPDATE OF ultima_resposta_em ON attempts BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  expect((await req(`rooms/${id}/answer`,'POST',{question_id:start.questoes[0].id,alternativa_idx:0},user.cookie)).status).toBe(500);
  expect((sqlite.prepare('SELECT COUNT(*) AS total FROM answers WHERE attempt_id=?').get(start.attempt.id) as any).total).toBe(0);
 });
 it('recuperação concorrente consome o token uma única vez e revoga sessões',async()=>{
  const user=await register('reset');
  const j:any=await (await req('auth/forgot','POST',{email:'reset@example.test'})).json();
  const responses=await Promise.all([req('auth/reset','POST',{token:j.tokenTeste,novaSenha:'NovaFicticia123!'}),req('auth/reset','POST',{token:j.tokenTeste,novaSenha:'OutraFicticia123!'})]);
  expect(responses.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await req('auth/me','GET',undefined,user.cookie)).status).toBe(401);
 });
 it('falha ao gravar alternativas desfaz toda regeneração e preserva questões anteriores',async()=>{
  const {admin,id}=await room();expect((await req(`rooms/${id}/generate`,'POST',{},admin.cookie)).status).toBe(200);
  const old=sqlite.prepare('SELECT id,enunciado FROM questions WHERE room_id=? ORDER BY ordem').all(id);
  sqlite.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON question_options BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;");
  expect((await req(`rooms/${id}/generate?force=1`,'POST',{},admin.cookie)).status).toBe(500);
  expect(sqlite.prepare('SELECT id,enunciado FROM questions WHERE room_id=? ORDER BY ordem').all(id)).toEqual(old);
 });
 it('resposta simultânea à finalização mantém respostas e placar coerentes',async()=>{
  const {admin,id}=await room();await req(`rooms/${id}/generate`,'POST',{},admin.cookie);
  sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('ACTIVE',id);
  const user=await register('corrida');const start:any=await (await req(`rooms/${id}/start`,'POST',{},user.cookie)).json();
  await Promise.all([req(`rooms/${id}/answer`,'POST',{question_id:start.questoes[0].id,alternativa_idx:0},user.cookie),req(`rooms/${id}/finish`,'POST',{},user.cookie)]);
  await req(`rooms/${id}/finish`,'POST',{},user.cookie);
  const att:any=sqlite.prepare('SELECT * FROM attempts WHERE id=?').get(start.attempt.id);
  const count:any=sqlite.prepare('SELECT SUM(correta) AS total FROM answers WHERE attempt_id=?').get(att.id);
  expect(att.status).toBe('finalizada');expect(att.acertos).toBe(count.total||0);
  const score:any=sqlite.prepare('SELECT pontuacao FROM scores WHERE attempt_id=?').get(att.id);expect(score.pontuacao).toBe(att.pontuacao);
  expect((await req(`rooms/${id}/answer`,'POST',{question_id:start.questoes[1].id,alternativa_idx:0},user.cookie)).status).toBe(409);
 });
});


it('empates completos têm a mesma posição no ranking e no resultado pessoal', async () => {
 const {id}=await room();
 sqlite.prepare('UPDATE rooms SET status=? WHERE id=?').run('ACTIVE',id);
 const a=await register('empatea'), b=await register('empateb');
 for (const [idx,user] of [a,b].entries()) sqlite.prepare("INSERT INTO attempts (id,user_id,room_id,status,acertos,erros,pontuacao,tempo_total) VALUES (?,?,?,'finalizada',1,4,100,20)").run('empate'+idx,user.user.id,id);
 const rank:any=await (await req(`rooms/${id}/ranking`)).json();
 expect(rank.ranking.map((r:any)=>r.posicao)).toEqual([1,1]);
 const result:any=await (await req(`rooms/${id}/result`,'GET',undefined,b.cookie)).json();
 expect(result.resultado.posicao).toBe(1);
});

it('produção não publica demonstração quando IA está indisponível', async () => {
 await expect(new AIService({ENVIRONMENT:'production'}).generateQuestions({materia:'Teste',assuntos:['Soma'],dificuldade:'medio',quantidade:5})).rejects.toThrow('IA indisponível');
});
