import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const url=process.env.SUPABASE_URL
const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!url||!serviceRoleKey)throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.')
const supabase=createClient(url,serviceRoleKey,{auth:{autoRefreshToken:false,persistSession:false}})
const accounts=[
  {name:'Betzabe Escobar',email:'betzabxscobar@gmail.com',role:'superadmin'},
  {name:'Andrés Zurita',email:'dandreszurtaf23@gmail.com',role:'superadmin'},
  {name:'Alex Yánez',email:'alexyanez1119@gmail.com',role:'admin'},
  {name:'Mayuri Remache',email:'mayuriremache0@gmail.com',role:'admin'},
  {name:'Javier Conforme',email:'javierconforme18@gmail.com',role:'admin'},
]
const passwordFor=()=>`Ride-${randomBytes(12).toString('base64url')}!`
const credentials=[]
for(const account of accounts){
  const password=passwordFor()
  const {data:list,error:listError}=await supabase.auth.admin.listUsers({page:1,perPage:1000})
  if(listError)throw listError
  let user=list.users.find(item=>item.email?.toLowerCase()===account.email)
  const attributes={email:account.email,password,email_confirm:true,user_metadata:{full_name:account.name},app_metadata:{role:account.role,must_change_password:true}}
  if(user){const {data,error}=await supabase.auth.admin.updateUserById(user.id,attributes);if(error)throw error;user=data.user}
  else{const {data,error}=await supabase.auth.admin.createUser(attributes);if(error)throw error;user=data.user}
  const {error:profileError}=await supabase.from('profiles').upsert({user_id:user.id,email:account.email,full_name:account.name,role:account.role,must_change_password:true},{onConflict:'user_id'})
  if(profileError)throw profileError
  credentials.push(`${account.role.toUpperCase()} | ${account.email} | ${password}`)
}
const root=join(dirname(fileURLToPath(import.meta.url)),'..');const dataDir=join(root,'data');await mkdir(dataDir,{recursive:true})
const path=join(dataDir,'credenciales-supabase.txt')
await writeFile(path,`CREDENCIALES TEMPORALES DE SUPABASE\nGeneradas: ${new Date().toISOString()}\nEntregar por separado y eliminar tras el primer acceso.\n\n${credentials.join('\n')}\n`)
console.log(`Cuentas creadas y roles asignados. Credenciales guardadas localmente en: ${path}`)
