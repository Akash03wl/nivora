import {writeFileSync} from 'node:fs';
import {gerarSQL} from './seed-enem.mjs';
import {montarSalas} from '../content/enem-topicos.mjs';
const salas=montarSalas();
writeFileSync(new URL('../content/enem-topicos.sql',import.meta.url),gerarSQL(salas,'nivora_enem_v3_'));
console.log(`${salas.length} simulados temáticos, ${salas.reduce((n,s)=>n+s.questoes.length,0)} questões.`);
