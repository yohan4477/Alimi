import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compareOffers} from '../dist/compare-offers.js';
export {compareOffers};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==3)throw Error('Usage: node scripts/compare-offers.mjs input.json');const {request,offers}=JSON.parse(await readFile(process.argv[2],'utf8'));console.log(JSON.stringify(compareOffers(request,offers),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}

