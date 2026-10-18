// BEANNETWORK сервер + Supabase. Node 18+, без зависимостей.
// Переменные окружения на Render: SUPA_URL (https://xxxx.supabase.co) и SUPA_KEY (service_role / secret key)
// Роли в users.role: 'admin' (или 'owner') = главный админ/создатель, 'mod' = малая модерация, '' = обычный игрок
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
const sys=(uid,t)=>db('messages','POST',{a:'sys',b:uid,t,ts:Date.now(),kind:'s',an:'Система'});
const isOwn=r=>r=='admin'||r=='owner',isStaff=r=>isOwn(r)||r=='mod';
http.createServer((q,s)=>{
  s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');s.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(q.method=='OPTIONS'){s.statusCode=204;return s.end()}
  let b='';q.on('data',c=>{b+=c;if(b.length>1.6e5)q.destroy()});
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
        const u=(await db('users?select=id,n,ph,tok,ban&n=ilike.'+enc(n)+'&limit=5')).find(x=>x.n.toLowerCase()==n.toLowerCase());
        if(!u||!vp(pw,u.ph))return j({err:'Неверный ник или пароль'});if(u.ban>Date.now())return j({err:'Аккаунт забанен'});
        let tok=u.tok;if(!tok){tok=cr.randomUUID();await db('users?id=eq.'+enc(u.id),'PATCH',{tok})}
        return j({id:u.id,tok,n:u.n})}
      const t=q.headers.authorization||'',me=t.length>=10?(await db('users?select=id,n,role,ban,mute,strikes,seen&tok=eq.'+enc(t)))[0]:null;
      if(!me)return j({err:'auth'},401);if(me.ban>Date.now())return j({err:'banned'},403);
      const own=isOwn(me.role),mod=me.role=='mod',adm=own||mod; // own = создатель, mod = малая модерация, adm = любой из них
      if(p=='/logout'){await db('users?id=eq.'+enc(me.id),'PATCH',{tok:cr.randomUUID()});return j({ok:1})}
      if(p=='/me/delete'){await db('messages?or=(a.eq.'+me.id+',b.eq.'+me.id+')','DELETE');await db('post_likes?uid=eq.'+enc(me.id),'DELETE');await db('posts?uid=eq.'+enc(me.id),'DELETE');await db('users?id=eq.'+enc(me.id),'DELETE');return j({ok:1})}
      if(p=='/posts'){const l=await db('posts?select=id,uid,n,t,img,ts&del=eq.false&order=ts.desc&limit=30');if(!l.length)return j([]);
        const ids=l.map(x=>x.id).join(','),uids=[...new Set(l.map(x=>x.uid).filter(x=>ID.test(x)))];
        const [lk,us]=await Promise.all([db('post_likes?select=post_id,uid&post_id=in.('+ids+')&limit=5000'),uids.length?db('users?select=id,role&id=in.('+uids.join(',')+')'):[]]);
        const rl={},cn={},mi={};us.forEach(u=>rl[u.id]=u.role);lk.forEach(x=>{cn[x.post_id]=(cn[x.post_id]||0)+1;if(x.uid==me.id)mi[x.post_id]=1});
        return j(l.map(x=>({...x,role:rl[x.uid]||'',likes:cn[x.id]||0,liked:!!mi[x.id]})))}
      if(p=='/post'){const t=String(d.t||'').trim().slice(0,500),img=String(d.img||'');
        if(me.mute>Date.now())return j({err:'Ты в муте'});
        if((!t&&!img)||(img&&!(/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(img)&&img.length<12e4)))return j({err:'Плохой пост или фото'});
        await db('posts','POST',{uid:me.id,n:me.n,t,img,ts:Date.now()});return j({ok:1})}
      if(p=='/post/like'){const id=Math.floor(+d.id);if(!(id>0))return j({err:'bad'});
        if(!(await db('posts?select=id&id=eq.'+id+'&del=eq.false')).length)return j({err:'Нет поста'});
        const has=(await db('post_likes?select=uid&post_id=eq.'+id+'&uid=eq.'+enc(me.id))).length>0;
        if(has)await db('post_likes?post_id=eq.'+id+'&uid=eq.'+enc(me.id),'DELETE');
        else try{await db('post_likes','POST',{post_id:id,uid:me.id})}catch(e){if(e.status!=409)throw e}
        const n=(await db('post_likes?select=uid&post_id=eq.'+id+'&limit=5000')).length;
        return j({liked:!has,likes:n})}
      if(p=='/post/del'){const id=Math.floor(+d.id);if(!(id>0))return j({err:'bad'});const r=(await db('posts?select=uid&id=eq.'+id))[0];if(!r)return j({err:'Нет поста'});
        if(r.uid!=me.id){if(!adm)return j({err:'Нельзя'});
          if(!own){const au=(await db('users?select=role&id=eq.'+enc(r.uid)))[0];if(au&&isStaff(au.role))return j({err:'Нельзя'})}} // малая модерация не трогает посты создателя и других модераторов
        await db('posts?id=eq.'+id,'PATCH',{del:true});
        if(r.uid!=me.id)await sys(r.uid,'🚫 Твой пост заблокирован модерацией'+(d.reason?': '+String(d.reason).slice(0,100):''));
        return j({ok:1})}
      if(p.startsWith('/admin/')){if(!adm)return j({err:'Нет прав'},403);
        if(p=='/admin/act'){const id=String(d.id||'');if(!ID.test(id)||id==me.id)return j({err:'Нельзя'});
          const u=(await db('users?select=id,role,strikes&id=eq.'+enc(id)))[0];
          if(!u||isOwn(u.role)||(!own&&u.role=='mod'))return j({err:'Нельзя'}); // создателя не трогает никто, модераторов — только создатель
          const A={ban:{ban:9e15},unban:{ban:0},mute:{mute:Date.now()+36e5},unmute:{mute:0},strike:{strikes:(u.strikes||0)+1},unstrike:{strikes:0}}[d.act];
          if(!A)return j({err:'bad'});await db('users?id=eq.'+enc(id),'PATCH',A);
          if(d.act=='strike')await sys(id,'⚠️ Тебе выдан страйк ('+A.strikes+')');if(d.act=='mute')await sys(id,'🔇 Ты в муте на 1 час');
          return j({ok:1})}
        if(!own)return j({err:'Только для создателя'},403); // всё ниже — только главный админ
        if(p=='/admin/chats'){const u=U.searchParams.get('u')||'';if(!ID.test(u))return j([]);
          const m=await db('messages?select=a,b&or=(a.eq.'+u+',b.eq.'+u+')&limit=500'),z=new Set();m.forEach(x=>{const o=x.a==u?x.b:x.a;if(o!='sys'&&o!='all'&&ID.test(o))z.add(o)});
          const ids=[...z];return j(ids.length?await db('users?select=id,n&id=in.('+ids.join(',')+')'):[])}
        if(p=='/admin/chat'){const a=U.searchParams.get('a')||'',b2=U.searchParams.get('b')||'';if(!ID.test(a)||!ID.test(b2))return j([]);
          return j((await db('messages?select=a,an,t&or=(and(a.eq.'+a+',b.eq.'+b2+'),and(a.eq.'+b2+',b.eq.'+a+'))&order=ts.desc&limit=100')).reverse().map(x=>({f:x.a==a?1:0,n:x.an,t:x.t})))}
        if(p=='/admin/role'){const id=String(d.id||''),r=d.role=='mod'?'mod':d.role=='user'?'':null;if(!ID.test(id)||r===null||id==me.id)return j({err:'bad'});
          const u=(await db('users?select=id,role&id=eq.'+enc(id)))[0];if(!u||isOwn(u.role))return j({err:'Нельзя'});
          await db('users?id=eq.'+enc(id),'PATCH',{role:r});await sys(id,r?'🛡 Тебя назначили модератором':'Модерация с тебя снята');return j({ok:1})}
        if(p=='/admin/give'){const id=String(d.id||''),a=Math.floor(+d.amount);if(!ID.test(id)||!(a>0)||a>1e9)return j({err:'Неверная сумма'});
          if(!(await db('users?select=id&id=eq.'+enc(id))).length)return j({err:'Игрок не найден'});
          await db('rpc/add_coins','POST',{uid:id,amt:a});await sys(id,'💰 Тебе начислено '+a.toLocaleString('ru')+' 🫘');return j({ok:1})}
        if(p=='/admin/notify'){const x=String(d.text||'').trim().slice(0,300),to=String(d.to||'');if(!x||(to!='all'&&!ID.test(to)))return j({err:'bad'});
          if(to=='all'){const us=await db('users?select=id&limit=2000'),ts=Date.now();if(us.length)await db('messages','POST',us.map(u=>({a:'sys',b:u.id,t:x,ts,kind:'s',an:'Система'})))}
          else{if(!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'Игрок не найден'});await sys(to,x)}
          return j({ok:1})}
        return j({err:'404'},404)}
      if(p=='/score'){const v=Math.floor(Math.min(+d.s||0,1e12));if(v>0)await db('users?id=eq.'+enc(me.id)+'&s=lt.'+v,'PATCH',{s:v});return j({ok:1})}
      if(p=='/users'){const w=(U.searchParams.get('q')||'').replace(/[^\p{L}\p{N}_ .\-]/gu,'').slice(0,16);
        return j(await db('users?select='+(adm?'id,n,s,seen,role,ban,mute,strikes':'id,n,s,seen,role')+'&id=neq.'+enc(me.id)+(w?'&n=ilike.*'+enc(w)+'*':'')+'&order=s.desc&limit=30'))}
      if(p=='/chat'&&q.method=='POST'){const w=String(d.text||'').trim().slice(0,300),to=String(d.to||'');
        if(!w||!ID.test(to)||to==me.id||to=='sys')return j({err:'bad'});
        if(me.mute>Date.now())return j({err:'Ты в муте'});
        if(to!='all'&&!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'bad'});
        await db('messages','POST',{a:me.id,b:to,t:w,ts:Date.now(),an:me.n});return j({ok:1})}
      if(p=='/chat'){const o=U.searchParams.get('with')||'';if(!ID.test(o))return j({m:[]});
        const m=await db('messages?select=a,an,t,ts,kind&'+(o=='all'?'b=eq.all':o=='sys'?'a=eq.sys&b=eq.'+me.id:'or=(and(a.eq.'+me.id+',b.eq.'+o+'),and(a.eq.'+o+',b.eq.'+me.id+'))')+'&order=ts.desc&limit=100'),
          pu=o=='all'||o=='sys'?[]:await db('users?select=seen&id=eq.'+enc(o)),rl={};
        if(o=='all'){const ids=[...new Set(m.map(x=>x.a).filter(x=>ID.test(x)))];if(ids.length)(await db('users?select=id,role&id=in.('+ids.join(',')+')')).forEach(u=>rl[u.id]=u.role)}
        return j({m:m.reverse().map(x=>({f:x.a==me.id?1:0,n:x.an,t:x.t,ts:x.ts,k:x.kind,role:rl[x.a]||''})),seen:(pu[0]||{}).seen||0})}
      if(p=='/chats'){const m=await db('messages?select=a,b,t&or=(a.eq.'+me.id+',b.eq.'+me.id+')&order=ts.desc&limit=300'),z={};
        m.forEach(x=>{const o=x.a==me.id?x.b:x.a;if(!z[o])z[o]={id:o,last:x.t}});
        const ids=Object.keys(z).filter(i=>ID.test(i));if(!ids.length)return j([]);
        return j((await db('users?select=id,n,seen,role&id=in.('+ids.join(',')+')')).map(u=>({id:u.id,n:u.n,seen:u.seen,role:u.role})))}
      if(p=='/transfer'){const a=Math.floor(+d.amount),to=String(d.to||'');
        if(!(a>0)||a>1e7||!ID.test(to)||to==me.id)return j({err:'Неверный перевод'});
        if(!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'Игрок не найден'});
        await db('rpc/add_coins','POST',{uid:to,amt:a});await db('messages','POST',{a:me.id,b:to,t:'💸 Перевод: '+a.toLocaleString('ru')+' 🫘',ts:Date.now(),kind:'t',an:me.n});return j({ok:1})}
      if(p=='/poll'){const since=+U.searchParams.get('since')||Date.now(),now=Date.now();
        if(now-(me.seen||0)>2e4)db('users?id=eq.'+enc(me.id),'PATCH',{seen:now}).catch(()=>{});
        const c=+(await db('rpc/claim_coins','POST',{uid:me.id}))||0,m=await db('messages?select=an,t,kind,ts&b=eq.'+enc(me.id)+'&ts=gt.'+since+'&order=ts.asc&limit=5');
        return j({coins:c,m,now,role:me.role})}
      j({err:'404'},404)
    }catch(e){console.error(e.message);j({err:'Ошибка сервера'},500)}
  })
}).listen(process.env.PORT||3000,()=>console.log('BEANNETWORK ok'));
    
