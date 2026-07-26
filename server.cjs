const http = require('http');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgres://postgres:pgpass123@localhost:5432/transport' });
http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.end(); return; }
  const url = new URL(req.url, 'http://x');
  const table = url.pathname.replace(/^\//, '');
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      if (req.method === 'GET') {
        const params = []; const conds = []; let orderCol = ''; let orderDir = 'ASC';
        const joins = []; let selectCols = '"' + table + '".*';
        const selVal = url.searchParams.get('select') || '*';
        const parts = []; let depth = 0; let cur = '';
        for (const ch of selVal) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch; }
        if (cur.trim()) parts.push(cur.trim());
        for (const p of parts) {
          if (p === '*') continue;
          const m = p.match(/^(\w+)\(([^)]+)\)$/);
          if (m) {
            const rn = m[1]; const rc = m[2].split(',').map(c=>c.trim());
            const fk = {cars:'car_id',drivers:'driver_id',contractors:'contractor_id',trips:'trip_id'};
            const fkc = fk[rn] || rn + '_id';
            joins.push('LEFT JOIN "' + rn + '" ON "' + table + '"."' + fkc + '" = "' + rn + '"."id"');
            selectCols += ',' + rc.map(c => '"' + rn + '"."' + c + '" AS "' + rn + ':' + c + '"').join(',');
          }
        }
        url.searchParams.forEach((v,k) => {
          if (k === 'select' || k === 'limit') return;
          if (k === 'order') { const dot = v.lastIndexOf('.'); orderCol = dot > 0 ? v.substring(0,dot) : v; orderDir = v.endsWith('.desc') ? 'DESC' : 'ASC'; return; }
          const eq = v.match(/^eq\.(.+)/); if (eq) { params.push(decodeURIComponent(eq[1])); conds.push('"' + table + '"."' + k + '" = $' + params.length); }
          const gte = v.match(/^gte\.(.+)/); if (gte) { params.push(decodeURIComponent(gte[1])); conds.push('"' + table + '"."' + k + '" >= $' + params.length); }
          const lte = v.match(/^lte\.(.+)/); if (lte) { params.push(decodeURIComponent(lte[1])); conds.push('"' + table + '"."' + k + '" <= $' + params.length); }
        });
        let q = 'SELECT ' + selectCols + ' FROM "' + table + '"';
        if (joins.length) q += ' ' + joins.join(' ');
        if (conds.length) q += ' WHERE ' + conds.join(' AND ');
        if (orderCol) q += ' ORDER BY "' + orderCol + '" ' + orderDir;
        if (url.searchParams.has('limit')) q += ' LIMIT ' + url.searchParams.get('limit');
        const result = await pool.query(q, params);
        const rows = result.rows.map(r => { const obj={}; const refs={}; Object.keys(r).forEach(key=>{const col=key.split(':');if(col.length===2){if(!refs[col[0]])refs[col[0]]={};refs[col[0]][col[1]]=r[key]}else obj[key]=r[key]}); Object.keys(refs).forEach(n=>{obj[n]=Object.values(refs[n]).every(v=>v===null)?null:{...refs[n]}}); return obj; });
        res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(rows));
      } else if (req.method === 'POST') { const d=JSON.parse(body);if(d.id)delete d.id; const cols=Object.keys(d).map(c=>'"'+c+'"').join(','); const vals=Object.values(d).filter(v=>v!==undefined&&v!==''); const ph=vals.map((_,i)=>'$'+(i+1)).join(','); const r2=await pool.query('INSERT INTO "'+table+'" ('+cols+') VALUES ('+ph+') RETURNING *',vals); res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(r2.rows[0]||{}));
      } else if (req.method === 'DELETE') { const p=[];url.searchParams.forEach((v,k)=>{const m=v.match(/^eq\.(.+)/);if(m)p.push(decodeURIComponent(m[1]))}); if(p.length)await pool.query('DELETE FROM "'+table+'" WHERE id=$1',[p[0]]); res.writeHead(200,{'Content-Type':'application/json'});res.end('[]');
      } else if (req.method === 'PATCH') { const d=JSON.parse(body);const pv=Object.values(d);const sets=Object.keys(d).map((k,i)=>'"'+k+'"=$'+(i+1)).join(','); const m=[...url.searchParams.entries()].find(([_,v])=>v.startsWith('eq.'));if(m)pv.push(decodeURIComponent(m[1].slice(3)));await pool.query('UPDATE "'+table+'" SET '+sets+' WHERE id=$'+pv.length,pv);res.writeHead(200,{'Content-Type':'application/json'});res.end('[]');
      } else { res.writeHead(405);res.end('[]'); }
    } catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}
  });
}).listen(3000);
