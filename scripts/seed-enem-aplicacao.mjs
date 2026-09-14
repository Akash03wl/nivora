import {writeFileSync} from 'node:fs';
import {gerarSQL} from './seed-enem.mjs';
import {salasAplicacao} from '../content/enem-aplicacao.mjs';
writeFileSync(new URL('../content/enem-aplicacao.sql',import.meta.url),gerarSQL(salasAplicacao,'nivora_enem_v2_'));
console.log('Segunda série: 6 simulados, 30 questões.');
