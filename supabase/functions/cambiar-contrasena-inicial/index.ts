import { createClient } from 'npm:@supabase/supabase-js@2.112.4'

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, content-type','Content-Type':'application/json'}
Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers})
  try{
    const authorization=req.headers.get('Authorization')||''
    const jwt=authorization.replace('Bearer ','')
    const url=Deno.env.get('SUPABASE_URL')!
    const publishable=Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const userClient=createClient(url,publishable,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})
    const {data:{user},error:userError}=await userClient.auth.getUser(jwt)
    if(userError||!user)return new Response(JSON.stringify({message:'Sesión inválida.'}),{status:401,headers})
    const role=user.app_metadata?.role
    if(!['admin','superadmin'].includes(role)||user.app_metadata?.must_change_password!==true)return new Response(JSON.stringify({message:'Este cambio inicial no corresponde a la cuenta.'}),{status:403,headers})
    const {password}=await req.json()
    if(typeof password!=='string'||password.length<10)return new Response(JSON.stringify({message:'La contraseña debe tener mínimo 10 caracteres.'}),{status:400,headers})
    const admin=createClient(url,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}})
    const {error:updateError}=await admin.auth.admin.updateUserById(user.id,{password,app_metadata:{...user.app_metadata,must_change_password:false}})
    if(updateError)throw updateError
    const {error:profileError}=await admin.from('profiles').update({must_change_password:false,password_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',user.id)
    if(profileError)throw profileError
    return new Response(JSON.stringify({ok:true}),{status:200,headers})
  }catch(error){return new Response(JSON.stringify({message:error instanceof Error?error.message:'Error inesperado.'}),{status:500,headers})}
})
