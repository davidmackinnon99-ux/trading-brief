import { evaluateAsync, disconnect } from '../../src/connection.js';
const r = await evaluateAsync(`fetch(${JSON.stringify(process.argv[2])}, {credentials:'include'}).then(async r => r.status + ' ' + (await r.text())).catch(e => 'ERR ' + e.message)`);
console.log(String(r).slice(0, Number(process.argv[3] || 800)));
await disconnect(); process.exit(0);
