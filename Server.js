// BEANNETWORK сервер: Node 18+, без зависимостей
const http=require('http'),fs=require('fs'),cr=require('crypto'),F='data.json';
let D={u:{},m:[]};try{D=JSON.parse(fs.readFileSync(F))}catch(e){}
const save=()=>fs.writeFile(F,JSON.stringify(D),()=>{}),hs=p=>cr.createHash('sha256').update(p+'bean').digest('hex'),
pub=u=>({id:u.id,n:u.n,s:u.s||0}),all=()=>Object.values(D.u);
http.createServer((q,s)=>{
s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');s.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
if(q.method=='OPTIONS')return s.end();
let b='';q.on('data',c=>b+=c);q.on('end',()=>{
const U=new URL(q.url,'http://x'),p=U.pathname,j=x=>{s.setHeader('Content-Type','application/json');s.end(JSON.stringify(x))};
let d={};try{d=JSON.parse(b)}catch(e){}
const me=all().find(u=>u.tok&&u.tok===q.headers.authorization);
if(p=='/register'||p=='/login'){
 const n=String(d.n||'').slice(0,16),pw=String(d.p||''),ex=all().find(u=>u.n.toLowerCase()==n.toLowerCase());
 if(p=='/register'){if(n.length<2||pw.length<4)return j({err:'Слишком короткие данные'});if(ex)return j({err:'Ник занят'});
  const u={id:cr.randomUUID().slice(0,8),n,ph:hs(pw),tok:cr.randomUUID(),s:+d.s||0,c:0};D.u[u.id]=u;save();return j({id:u.id,tok:u.tok,n})}
 if(!ex||ex.ph!=hs(pw))return j({err:'Неверный ник или пароль'});ex.tok=cr.randomUUID();save();return j({id:ex.id,tok:ex.tok,n:ex.n})}
if(p=='/leaderboard')return j(all().sort((a,b)=>b.s-a.s).slice(0,50).map(u=>({n:u.n,s:u.s})));
if(!me)return j({err:'auth'});
if(p=='/score'){me.s=Math.max(me.s||0,+d.s||0);save();return j({ok:1})}
if(p=='/users'){const t=(U.searchParams.get('q')||'').toLowerCase();return j(all().filter(u=>u.id!=me.id&&u.n.toLowerCase().includes(t)).slice(0,30).map(pub))}
if(p=='/chat'&&q.method=='POST'){const t=String(d.text||'').slice(0,300);if(!t||!D.u[d.to])return j({err:'bad'});D.m.push({a:me.id,b:d.to,t,ts:Date.now()});D.m=D.m.slice(-5000);save();return j({ok:1})}
if(p=='/chat'){const o=U.searchParams.get('with');return j(D.m.filter(m=>(m.a==me.id&&m.b==o)||(m.a==o&&m.b==me.id)).slice(-100).map(m=>({f:m.a==me.id?1:0,t:m.t,ts:m.ts})))}
if(p=='/chats'){const z={};D.m.slice().reverse().forEach(m=>{if(m.a!=me.id&&m.b!=me.id)return;const o=m.a==me.id?m.b:m.a;if(!z[o]&&D.u[o])z[o]={id:o,n:D.u[o].n,last:m.t}});return j(Object.values(z))}
if(p=='/transfer'){const a=Math.floor(d.amount),t=D.u[d.to];if(!t||!(a>0)||a>1e7)return j({err:'Неверный перевод'});t.c=(t.c||0)+a;save();return j({ok:1})}
if(p=='/poll'){const c=me.c||0;me.c=0;if(c)save();return j({coins:c})}
j({err:'404'})})}).listen(process.env.PORT||3000);
  
