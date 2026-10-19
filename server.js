// BEANNETWORK сервер + Supabase. Node 18+, без зависимостей.
// Переменные окружения на Render: SUPA_URL (https://xxxx.supabase.co) и SUPA_KEY (service_role / secret key)
const http=require('http'),cr=require('crypto');let webpush=null;try{webpush=require('web-push')}catch(e){console.error('web-push не установлен: push отключены')}
const BASE=(process.env.SUPA_URL||'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/,''),KEY=(process.env.SUPA_KEY||'').trim();
if(!BASE||!KEY){console.error('Нет SUPA_URL или SUPA_KEY');process.exit(1)}
const HD={apikey:KEY,'Content-Type':'application/json',Prefer:'return=representation'};
if(KEY.startsWith('eyJ'))HD.Authorization='Bearer '+KEY;
async function db(path,method='GET',body){
  const r=await fetch(BASE+'/rest/v1/'+path,{method,headers:HD,body:body===undefined?undefined:JSON.stringify(body)});
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch(e){}
  if(!r.ok){const e=new Error('db '+r.status+' '+t.slice(0,200));e.status=r.status;throw e}
  return j}
const cardNum=()=>{const d=[9,0,0,0];for(let i=0;i<12;i++)d.push(cr.randomInt(0,10));const lu=a=>{let t=0;a.slice().reverse().forEach((x,i)=>{if(i%2==1){x*=2;if(x>9)x-=9}t+=x});return t%10==0};if(lu(d))d[15]=(d[15]+1)%10;return d.join('').replace(/(\d{4})(?=\d)/g,'$1 ')};
const myClan=async uid=>{const p=(await db('bb_players?select=id&acc=eq.'+enc(uid)))[0];if(!p)return null;const m=(await db('bb_cmem?select=cid&pid=eq.'+enc(p.id)))[0];if(!m)return null;return(await db('bb_clans?select=id,name&id=eq.'+enc(m.cid)))[0]||null};
const MX={p:[/^data:image\/jpeg;base64,/,18e4],g:[/^data:image\/gif;base64,/,4e5],v:[/^data:video\/(webm|mp4)[^,]{0,60},/,25e4],a:[/^data:audio\/(webm|mp4|ogg)[^,]{0,60},/,16e4]};
const clean=()=>db('messages?mt=in.(p,g,v,a)&ts=lt.'+(Date.now()-3*864e5),'PATCH',{mt:'x',media:''}).catch(()=>{});setTimeout(clean,5e3);setInterval(clean,6*36e5).unref();
const enc=encodeURIComponent,OK=/^[\p{L}\p{N}_ .\-]+$/u,ID=/^[\w-]{1,40}$/;
const hp=(p,s=cr.randomBytes(8).toString('hex'))=>s+':'+cr.scryptSync(p,s,32).toString('hex');
const vp=(p,h)=>{try{return cr.timingSafeEqual(Buffer.from(hp(p,h.split(':')[0])),Buffer.from(h))}catch(e){return false}};
const hits={},lim=ip=>{const n=Date.now(),a=(hits[ip]=(hits[ip]||[]).filter(t=>n-t<6e4));a.push(n);return a.length>10};
setInterval(()=>{for(const k in hits)if(!hits[k].some(t=>Date.now()-t<6e4))delete hits[k]},6e4).unref();
let VK=null;
(async()=>{if(!webpush)return;try{let r=(await db('kv?select=v&k=eq.vapid'))[0];if(!r){const g=webpush.generateVAPIDKeys();await db('kv','POST',{k:'vapid',v:JSON.stringify(g)});r={v:JSON.stringify(g)}}
  VK=JSON.parse(r.v);webpush.setVapidDetails('mailto:admin@beanbet.app',VK.publicKey,VK.privateKey)}catch(e){console.error('vapid',e.message)}})();
async function push(uid,title,body){if(!VK)return;try{for(const x of await db('push_subs?select=ep,sub&uid=eq.'+enc(uid)))
  webpush.sendNotification(JSON.parse(x.sub),JSON.stringify({title,body:String(body).slice(0,120)}),{TTL:86400,urgency:'high'}).catch(e=>{if(e.statusCode==404||e.statusCode==410)db('push_subs?ep=eq.'+enc(x.ep),'DELETE').catch(()=>{})})}catch(e){}}
const sys=async(uid,t)=>{await db('messages','POST',{a:'sys',b:uid,t,ts:Date.now(),kind:'s',an:'Система'});push(uid,'🔔 Система',t)};
http.createServer((q,s)=>{
  s.setHeader('Access-Control-Allow-Origin','*');s.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');s.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(q.method=='OPTIONS'){s.statusCode=204;return s.end()}
  let b='';q.on('data',c=>{b+=c;if(b.length>6e5)q.destroy()});
  q.on('end',async()=>{
    const U=new URL(q.url,'http://x'),p=U.pathname,ip=(q.headers['x-forwarded-for']||'').split(',')[0].trim()||q.socket.remoteAddress;
    const j=(x,c=200)=>{s.statusCode=c;s.setHeader('Content-Type','application/json');s.end(JSON.stringify(x))};
    try{
      let d={};try{d=JSON.parse(b)||{}}catch(e){}
      if(p=='/')return j({ok:1});
      if(p=='/vapid')return j({key:VK&&VK.publicKey});
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
      if(!me)return j({err:'auth'},401);if(me.ban>Date.now())return j({err:'banned'},403);const adm=me.role=='admin';
      if(p=='/push/sub'){const sb=d.sub||{},ep=String(sb.endpoint||'');if(!/^https:\/\//.test(ep)||!sb.keys)return j({err:'bad'});await db('push_subs?ep=eq.'+enc(ep),'DELETE');await db('push_subs','POST',{ep,uid:me.id,sub:JSON.stringify({endpoint:ep,keys:sb.keys})});return j({ok:1})}
      if(p=='/card'){let u=(await db('users?select=card,cvv,cexp&id=eq.'+enc(me.id)))[0]||{};
        if(!u.card)for(let k=0;k<20;k++){const nn=cardNum(),cv=String(cr.randomInt(0,1000)).padStart(3,'0');try{await db('users?id=eq.'+enc(me.id),'PATCH',{card:nn,cvv:cv,cexp:'11/45'});u={card:nn,cvv:cv,cexp:'11/45'};break}catch(e){if(e.status!=409)throw e}}
        return j({num:u.card,cvv:u.cvv,exp:u.cexp||'11/45',name:me.n})}
      if(p=='/logout'){await db('push_subs?uid=eq.'+enc(me.id),'DELETE');await db('users?id=eq.'+enc(me.id),'PATCH',{tok:cr.randomUUID()});return j({ok:1})}
      if(p=='/me/delete'){await db('push_subs?uid=eq.'+enc(me.id),'DELETE');await db('post_likes?uid=eq.'+enc(me.id),'DELETE');await db('messages?or=(a.eq.'+me.id+',b.eq.'+me.id+')','DELETE');await db('posts?uid=eq.'+enc(me.id),'DELETE');await db('users?id=eq.'+enc(me.id),'DELETE');return j({ok:1})}
      if(p=='/posts'){const l=await db('posts?select=id,uid,n,t,img,ts&del=eq.false&order=ts.desc&limit=30'),lk=l.length?await db('post_likes?select=post_id,uid&post_id=in.('+l.map(x=>x.id).join(',')+')'):[];
        return j(l.map(x=>({...x,likes:lk.filter(k=>k.post_id==x.id).length,liked:lk.some(k=>k.post_id==x.id&&k.uid==me.id)})))}
      if(p=='/post/like'){const id=Math.floor(+d.id);if(!(id>0))return j({err:'bad'});
        const e=await db('post_likes?select=uid&post_id=eq.'+id+'&uid=eq.'+enc(me.id));
        if(e.length)await db('post_likes?post_id=eq.'+id+'&uid=eq.'+enc(me.id),'DELETE');else await db('post_likes','POST',{post_id:id,uid:me.id});return j({ok:1})}
      if(p=='/post'){const t=String(d.t||'').trim().slice(0,500),img=String(d.img||'');
        if(me.mute>Date.now())return j({err:'Ты в муте'});
        if((!t&&!img)||(img&&!(/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(img)&&img.length<12e4)))return j({err:'Плохой пост или фото'});
        await db('posts','POST',{uid:me.id,n:me.n,t,img,ts:Date.now()});return j({ok:1})}
      if(p=='/post/del'){const id=Math.floor(+d.id);if(!(id>0))return j({err:'bad'});const r=(await db('posts?select=uid&id=eq.'+id))[0];if(!r)return j({err:'Нет поста'});
        if(r.uid!=me.id&&!adm)return j({err:'Нельзя'});
        await db('posts?id=eq.'+id,'PATCH',{del:true});
        if(r.uid!=me.id)await sys(r.uid,'🚫 Твой пост заблокирован администратором'+(d.reason?': '+String(d.reason).slice(0,100):''));
        return j({ok:1})}
      if(p.startsWith('/admin/')){if(!adm)return j({err:'Нет прав'},403);
        if(p=='/admin/act'){const id=String(d.id||'');if(!ID.test(id))return j({err:'bad'});
          const u=(await db('users?select=id,role,strikes&id=eq.'+enc(id)))[0];if(!u||u.role=='admin')return j({err:'Нельзя'});
          const A={ban:{ban:9e15},unban:{ban:0},mute:{mute:Date.now()+36e5},unmute:{mute:0},strike:{strikes:(u.strikes||0)+1},unstrike:{strikes:0}}[d.act];
          if(!A)return j({err:'bad'});await db('users?id=eq.'+enc(id),'PATCH',A);
          if(d.act=='strike')await sys(id,'⚠️ Тебе выдан страйк ('+A.strikes+')');if(d.act=='mute')await sys(id,'🔇 Ты в муте на 1 час');
          return j({ok:1})}
        if(p=='/admin/take'){const id=String(d.id||''),a=Math.floor(+d.amount);if(!ID.test(id)||!(a>0)||a>1e12)return j({err:'bad'});
          const u=(await db('users?select=id,role,c&id=eq.'+enc(id)))[0];if(!u||u.role=='admin')return j({err:'Нельзя'});
          await db('users?id=eq.'+enc(id),'PATCH',{c:(u.c||0)-a});await sys(id,'⚠️ Администратор забрал '+a.toLocaleString('ru')+' 🫘');return j({ok:1})}
        if(p=='/admin/packban'){const id=Math.floor(+d.id),pk=(await db('sticker_packs?select=uid&id=eq.'+(id||0)))[0];if(!pk)return j({err:'Нет пака'});
          await db('sticker_packs?id=eq.'+id,'PATCH',{ban:d.ban!==false});if(d.ban!==false)await sys(pk.uid,'🚫 Твой стикерпак заблокирован администратором');return j({ok:1})}
        if(p=='/admin/chats'){const u=U.searchParams.get('u')||'';if(!ID.test(u))return j([]);
          const m=await db('messages?select=a,b&or=(a.eq.'+u+',b.eq.'+u+')&limit=500'),z=new Set();m.forEach(x=>{const o=x.a==u?x.b:x.a;if(o!='sys'&&o!='all'&&ID.test(o))z.add(o)});
          const ids=[...z];return j(ids.length?await db('users?select=id,n&id=in.('+ids.join(',')+')'):[])}
        if(p=='/admin/chat'){const a=U.searchParams.get('a')||'',b2=U.searchParams.get('b')||'';if(!ID.test(a)||!ID.test(b2))return j([]);
          return j((await db('messages?select=a,an,t&or=(and(a.eq.'+a+',b.eq.'+b2+'),and(a.eq.'+b2+',b.eq.'+a+'))&order=ts.desc&limit=100')).reverse().map(x=>({f:x.a==a?1:0,n:x.an,t:x.t})))}
        return j({err:'404'},404)}
      if(p=='/score'){const v=Math.max(0,Math.floor(Math.min(+d.s||0,1e15)));await db('users?id=eq.'+enc(me.id),'PATCH',{s:v});return j({ok:1})}
            if(p=='/users'){const w=(U.searchParams.get('q')||'').replace(/[^\p{L}\p{N}_ .\-]/gu,'').slice(0,16);
        return j(await db('users?select='+(adm?'id,n,s,seen,role,ban,mute,strikes':'id,n,s,seen,role')+'&id=neq.'+enc(me.id)+(w?'&n=ilike.*'+enc(w)+'*':'')+'&order=s.desc&limit=30'))}
      if(p=='/chat'&&q.method=='POST'){const to=String(d.to||''),mt=String(d.mt||'');let w=String(d.text||'').trim().slice(0,300),md=String(d.media||'');
        if(!ID.test(to)||to==me.id||to=='sys')return j({err:'bad'});
        if(me.mute>Date.now())return j({err:'Ты в муте'});
        if(mt=='s'){const sk=(await db('stickers?select=pack_id&id=eq.'+(Math.floor(+md)||0)))[0],pk=sk&&(await db('sticker_packs?select=ban&id=eq.'+sk.pack_id))[0];if(!pk||pk.ban)return j({err:'Стикер недоступен'});md=String(Math.floor(+md));w=''}
        else if(mt){const m=MX[mt];if(!m||!m[0].test(md)||md.length>m[1])return j({err:'Файл не подходит или слишком большой'});w=''}
        else if(!w)return j({err:'bad'});
        let b2=to;if(to=='clan'){const c=await myClan(me.id);if(!c)return j({err:'Ты не в клане'});b2='clan:'+c.id}
        else if(to!='all'&&!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'bad'});
        await db('messages','POST',{a:me.id,b:b2,t:w,ts:Date.now(),an:me.n,mt:mt,media:md});
        if(to!='all'&&to!='clan')push(to,'💬 '+me.n,w||({p:'📷 Фото',g:'GIF',v:'🎥 Видео',a:'🎤 Голосовое',s:'Стикер'})[mt]);return j({ok:1})}
      if(p=='/chat'){const o=U.searchParams.get('with')||'';if(!ID.test(o))return j({m:[]});let f;
        if(o=='clan'){const c=await myClan(me.id);if(!c)return j({m:[]});f='b=eq.clan:'+c.id}
        else f=o=='all'?'b=eq.all':o=='sys'?'a=eq.sys&b=eq.'+me.id:'or=(and(a.eq.'+me.id+',b.eq.'+o+'),and(a.eq.'+o+',b.eq.'+me.id+'))';
        const m=await db('messages?select=id,a,an,t,ts,kind,mt&'+f+'&order=ts.desc&limit=100'),pu=['all','sys','clan'].includes(o)?[]:await db('users?select=seen&id=eq.'+enc(o));
        return j({m:m.reverse().map(x=>({id:x.id,f:x.a==me.id?1:0,n:x.an,t:x.t,ts:x.ts,k:x.kind,mt:x.mt})),seen:(pu[0]||{}).seen||0})}
      if(p=='/myclan'){const c=await myClan(me.id);return j(c?{id:c.id,n:c.name}:{})}
      if(p=='/media'){const id=Math.floor(+U.searchParams.get('id'));if(!(id>0))return j({err:'bad'});const x=(await db('messages?select=a,b,mt,media&id=eq.'+id))[0];if(!x)return j({err:'Нет файла'});
        let ok=x.a==me.id||x.b==me.id||x.b=='all';if(!ok&&String(x.b).startsWith('clan:')){const c=await myClan(me.id);ok=!!c&&x.b=='clan:'+c.id}if(!ok)return j({err:'Нет доступа'},403);
        if(x.mt=='s'){const sk=(await db('stickers?select=img,pack_id&id=eq.'+(Math.floor(+x.media)||0)))[0],pk=sk&&(await db('sticker_packs?select=ban&id=eq.'+sk.pack_id))[0];return j(pk&&!pk.ban?{m:sk.img}:{err:'🚫 Стикерпак заблокирован'})}
        return j({m:x.media})}
      if(p=='/packs')return j(await db('sticker_packs?select=id,uid,n,ban&order=ts.desc&limit=50'+(adm?'':'&ban=eq.false')));
      if(p=='/pack'&&q.method!='POST'){const id=Math.floor(+U.searchParams.get('id'));const pk=(await db('sticker_packs?select=ban&id=eq.'+(id||0)))[0];if(!pk||(pk.ban&&!adm))return j([]);return j(await db('stickers?select=id,img&pack_id=eq.'+id+'&order=id.asc&limit=30'))}
      if(p=='/pack'){const n=String(d.n||'').trim().slice(0,24);if(n.length<2)return j({err:'Название от 2 символов'});if(me.mute>Date.now())return j({err:'Ты в муте'});
        if((await db('sticker_packs?select=id&uid=eq.'+enc(me.id))).length>=5)return j({err:'Максимум 5 паков'});
        return j({ok:1,id:(await db('sticker_packs','POST',{uid:me.id,n,ts:Date.now()}))[0].id})}
      if(p=='/sticker'){const pid=Math.floor(+d.pack),img=String(d.img||''),pk=(await db('sticker_packs?select=uid,ban&id=eq.'+(pid||0)))[0];if(!pk||pk.uid!=me.id||pk.ban)return j({err:'Нельзя'});
        if(!/^data:image\/(webp|png);base64,/.test(img)||img.length>5e4)return j({err:'Стикер слишком большой'});
        if((await db('stickers?select=id&pack_id=eq.'+pid)).length>=24)return j({err:'В паке максимум 24 стикера'});
        await db('stickers','POST',{pack_id:pid,img});return j({ok:1})}
      if(p=='/pack/del'){const id=Math.floor(+d.id),pk=(await db('sticker_packs?select=uid&id=eq.'+(id||0)))[0];if(!pk||(pk.uid!=me.id&&!adm))return j({err:'Нельзя'});
        await db('stickers?pack_id=eq.'+id,'DELETE');await db('sticker_packs?id=eq.'+id,'DELETE');return j({ok:1})}
      if(p=='/chats'){const m=await db('messages?select=a,b,t&or=(a.eq.'+me.id+',b.eq.'+me.id+')&order=ts.desc&limit=300'),z={};
        m.forEach(x=>{const o=x.a==me.id?x.b:x.a;if(!z[o])z[o]={id:o,last:x.t}});
        const ids=Object.keys(z).filter(i=>ID.test(i));if(!ids.length)return j([]);
        return j((await db('users?select=id,n,seen,role&id=in.('+ids.join(',')+')')).map(u=>({id:u.id,n:u.n,seen:u.seen,role:u.role})))}
      if(p=='/transfer'){const a=Math.floor(+d.amount),to=String(d.to||'');
        if(!(a>0)||a>1e7||!ID.test(to)||to==me.id)return j({err:'Неверный перевод'});
        if(!(await db('users?select=id&id=eq.'+enc(to))).length)return j({err:'Игрок не найден'});
        await db('rpc/add_coins','POST',{uid:to,amt:a});await db('messages','POST',{a:me.id,b:to,t:'💸 Перевод: '+a.toLocaleString('ru')+' 🫘',ts:Date.now(),kind:'t',an:me.n});push(to,'💸 Перевод от '+me.n,a.toLocaleString('ru')+' 🫘');return j({ok:1})}
      if(p=='/poll'){const since=+U.searchParams.get('since')||Date.now(),now=Date.now();
        if(now-(me.seen||0)>2e4)db('users?id=eq.'+enc(me.id),'PATCH',{seen:now}).catch(()=>{});
        const c=+(await db('rpc/claim_coins','POST',{uid:me.id}))||0,m=await db('messages?select=an,t,kind,ts&b=eq.'+enc(me.id)+'&ts=gt.'+since+'&order=ts.asc&limit=5');
        return j({coins:c,m,now,role:me.role})}
      j({err:'404'},404)
    }catch(e){console.error(e.message);j({err:'Ошибка сервера'},500)}
  })
}).listen(process.env.PORT||3000,()=>console.log('BEANNETWORK ok'));
  
