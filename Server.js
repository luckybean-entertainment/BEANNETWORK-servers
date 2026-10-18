// BEANNETWORK сервер + Supabase. Node 18+, без зависимостей.
// Переменные окружения на Render: SUPA_URL (https://xxxx.supabase.co) и SUPA_KEY (service_role / secret key)
const http=require('http'),cr=require('crypto');
const BASE=(process.env.SUPA_URL||'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/,''),KEY=(process.env.SUPA_KEY||'').trim();
if(!BASE||!KEY){console.error('Нет SUPA_URL или SUPA_KEY');process.exit(1)}
const HD={apikey:KEY,'Content-Type':'application/json',Prefer:'return=representation'};
if(KEY.startsWith('eyJ'))HD.Authorization='Bearer '+KEY;
async function db(path,method='GET',body){
  const r=await fetch(BASE+'/rest/v1/'+path,{method,headers:HD,body:body===undefined?undefined:JSON.stringify(body)});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok){const e=new Error('db '+r.status+' '+t.slice(0,200));e.status=r.status;throw e}
  return j}
const enc=encodeURIComponent,OK=/^[\p{L}\p{N}_ .\-]+$/u,ID=/^[\w-]{1,40}$/;
const hp=(p,s=cr.randomBytes(8).toString('hex'))=>s+':'+cr.scryptSync(p,s,32).toString('hex');
const vp=(p,h)=>{try{return cr.timingSafeEqual(Buffer.from(hp(p,h.split(':')[0])),Buffer.from(h))}catch(e){return false}};
const hits={},lim=ip=>{const n=Date.now(),a=(hits[ip]=(hits[ip]||[]).filter(t=>n-t<6e4));a.push(n);return a.length>10};
setInterval(()=>{for(const k in hits)if(!hits[k].some(t=>Date.now()-t<6e4))delete hits[k]},6e4).unref();
http.createServer((q,s)=>{
  s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');s.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(q.method=='OPTIONS'){s.statusCode=204;return s.end()}
  let b='';q.on('data',c=>{b+=c;if(b.length>1e4)q.destroy()});
  q.on('end',async()=>{
    const U=new URL(q.url,'http://x'),p=U.pathname,ip=(q.headers['x-forwarded-for']||'').split(',')[0].trim()||q.socket.remoteAddress;
    const j=(x,c=200)=>{s.statusCode=c;s.setHeader('Content-Type','application/json');s.end(JSON.stringify(x))};
    try{
      let d={};try{d=JSON.parse(b)||{}}catch(e){}
      if(p=='/')return j({ok:1});
      if(p=='/leaderboard')return j(await db('users?select=n,s&order=s.desc&limit=50'));
      if(p=='/register'||p=='/login'){
        if(lim(ip))return j({err:'Слишком много попыток, подожди минуту'},429);
        const n=String(d.n||'').trim().slice(0,16),pw=String(d.p||'').slice(0,100);
        if(p=='/register'){
         if(n.length<2||pw.length<4)return j({err:'Ник от 2 символов, пароль от 4'});
          if(!OK.test(n))return j({err:'В нике только буквы, цифры, _ . - и пробел'});
          const u={id:cr.randomUUID().slice(0,8),n,ph:hp(pw),tok:cr.randomUUID(),s:Math.floor(Math.max(0,Math.min(+d.s||0,1e12)))};
          try{await db('users','POST',u)}catch(e){if(e.status==409)return j({err:'Ник занят'});throw e}
          return j({id:u.id,tok:u.tok,n})}
        if(!OK.test(n))return j({err:'Неверный ник или пароль'});
        const u=(await db('users?select=id,n,ph,tok&n=ilike.'+enc(n)+'&limit=5')).find(x=>x.n.toLowerCase()==n.toLowerCase());
        if(!u||!vp(pw,u.ph))return j({err:'Неверный ник или пароль'});
        let tok=u.tok;if(!tok){tok=cr.randomUUID();await db('users?id=eq.'+enc(u.id),'PATCH',{tok})}
        return j({id:u.id,tok,n:u.n})}
      const t=q.headers.authorization||'',me=t.length>=10?(await db('users?select=id,n&tok=eq.'+enc(t)))[0]:null;
      if(!me)return j({err:'auth'},401);
      if(p=='/score'){const v=Math.floor(Math.min(+d.s||0,1e12));if(v>0)await db('users?id=eq.'+enc(me.id)+'&s=lt.'+v,'PATCH',{s:v});return j({ok:1})}
      if(p=='/users'){const w=(U.searchParams.get('q')||'').replace(/[^\p{L}\p{N}_ .\-]/gu,'').slice(0,16);
        return j(await db('users?select=id,n,s&id=neq.'+enc(me.id)+(w?'&n=ilike.*'+enc(w)+'*':'')+'&order=s.desc&limit=30'))}
      if(p=='/chat'&&q.method=='POST'){const w=String(d.text||'').trim().slice(0,300),to=String(d.to||'');
        if(!w||!ID.test(to)||to==me.id)return j({err:'bad'});
        if(!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'bad'});
        await db('messages','POST',{a:me.id,b:to,t:w,ts:Date.now()});return j({ok:1})}
      if(p=='/chat'){const o=U.searchParams.get('with')||'';if(!ID.test(o))return j([]);
        const m=await db('messages?select=a,t,ts&or=(and(a.eq.'+me.id+',b.eq.'+o+'),and(a.eq.'+o+',b.eq.'+me.id+'))&order=ts.desc&limit=100');
        return j(m.reverse().map(x=>({f:x.a==me.id?1:0,t:x.t,ts:x.ts})))}
      if(p=='/chats'){const m=await db('messages?select=a,b,t&or=(a.eq.'+me.id+',b.eq.'+me.id+')&order=ts.desc&limit=300'),z={};
        m.forEach(x=>{const o=x.a==me.id?x.b:x.a;if(!z[o])z[o]={id:o,last:x.t}});
        const ids=Object.keys(z).filter(i=>ID.test(i));if(!ids.length)return j([]);
        return j((await db('users?select=id,n&id=in.('+ids.join(',')+')')).map(u=>({id:u.id,n:u.n,last:z[u.id].last})))}
      if(p=='/transfer'){const a=Math.floor(+d.amount),to=String(d.to||'');
        if(!(a>0)||a>1e7||!ID.test(to)||to==me.id)return j({err:'Неверный перевод'});
        if(!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'Игрок не найден'});
        await db('rpc/add_coins','POST',{uid:to,amt:a});return j({ok:1})}
      if(p=='/poll')return j({coins:+(await db('rpc/claim_coins','POST',{uid:me.id}))||0});
      j({err:'404'},404)
    }catch(e){console.error(e.message);j({err:'Ошибка сервера'},500)}
  })
}).listen(process.env.PORT||3000,()=>console.log('BEANNETWORK ok'));
         
