const BASE='http://localhost:3000';
function mk(){const jar=new Map();return async function req(p,o={}){
 const h={Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')};
 if(o.body!==undefined)h['Content-Type']='application/json'; if(o.csrf)h['x-csrf-token']=o.csrf;
 const r=await fetch(BASE+p,{method:o.method||'GET',headers:h,body:o.body===undefined?undefined:JSON.stringify(o.body)});
 for(const c of r.headers.getSetCookie?.()??[]){const[pa]=c.split(';');const i=pa.indexOf('=');jar.set(pa.slice(0,i),pa.slice(i+1));}
 const t=await r.text(); try{return{status:r.status,data:JSON.parse(t)}}catch{return{status:r.status,data:t}}};}

// --- مدیر: یک مدل را ویژه کن ---
const A=mk();
let me=await A('/api/auth/me');
const login=await A('/api/auth/login',{method:'POST',csrf:me.data.csrf,body:{email:'admin@example.com',password:'ChangeMe123!'}});
const acsrf=login.data.csrf;
const models=(await A('/api/admin/models')).data.filter(m=>m.enabled);
const target=models[0];
await A(`/api/admin/models/${target.id}`,{method:'PUT',csrf:acsrf,body:{min_tier:'premium'}});
const ref=`${target.provider_key}:${target.model_id}`;
console.log('  مدل ویژه‌شده     :', ref);

// --- کاربر عادی تازه ---
const U=mk();
let ume=await U('/api/auth/me');
const email=`tier${Date.now()}@example.com`;
const reg=await U('/api/auth/register',{method:'POST',csrf:ume.data.csrf,body:{name:'کاربر عادی',email,password:'Test12345!'}});
const ucsrf=reg.data.csrf;
console.log('  گروه کاربر تازه  :', reg.data.user.tier);

const umeta=await U('/api/analyze/meta');
const visible=umeta.data.models.map(m=>m.ref);
console.log('  مدل‌های قابل‌دید  :', visible.length, '— مدل ویژه دیده می‌شود؟', visible.includes(ref) ? 'بله ✗' : 'خیر ✓');

// تلاش برای استفاده از مدل ویژه
const blocked=await U('/api/analyze/stream',{method:'POST',csrf:ucsrf,body:{
  dilemma:'یک دوراهی آزمایشی برای بررسی کنترل دسترسی که به اندازه کافی طولانی است.', model: ref }});
console.log('  استفاده از مدل ویژه:', blocked.status, '—', typeof blocked.data==='object'?blocked.data.error:String(blocked.data).slice(0,60));

// --- ارتقا به ویژه و تلاش دوباره ---
const ulist=(await A('/api/admin/users?q='+encodeURIComponent(email))).data.items[0];
await A(`/api/admin/users/${ulist.id}`,{method:'PUT',csrf:acsrf,body:{tier:'premium'}});
const umeta2=await U('/api/analyze/meta');
console.log('  پس از ارتقا       :', umeta2.data.models.length, 'مدل — مدل ویژه دیده می‌شود؟',
  umeta2.data.models.map(m=>m.ref).includes(ref) ? 'بله ✓' : 'خیر ✗');

// --- سقف توکن ---
await A(`/api/admin/users/${ulist.id}`,{method:'PUT',csrf:acsrf,body:{token_override:1}});
const capped=await U('/api/analyze/stream',{method:'POST',csrf:ucsrf,body:{
  dilemma:'یک دوراهی آزمایشی دیگر برای بررسی سقف توکن که به اندازه کافی طولانی است.'}});
console.log('  با سقف توکن ۱     :', capped.status, '—', typeof capped.data==='object'?capped.data.error:'');

// پاک‌سازی
await A(`/api/admin/models/${target.id}`,{method:'PUT',csrf:acsrf,body:{min_tier:target.min_tier}});
await A(`/api/admin/users/${ulist.id}`,{method:'DELETE',csrf:acsrf});
console.log('  پاک‌سازی انجام شد.');
