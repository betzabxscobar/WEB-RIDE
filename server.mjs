// =====================================================================
// SIN USO - Reemplazado por Supabase Auth (2026-08-25)
// =====================================================================
// Ninguna pantalla llama ya a estos endpoints. La autenticacion vive en
// src/lib/auth.ts sobre Supabase. Este archivo guarda usuarios en
// data/users.json con un almacen local que no es el de produccion.
//
// Se conserva solo hasta confirmar que no hace falta. Al borrarlo, quitar
// tambien el script "dev:api" de package.json y data/users.json.
// =====================================================================

import { createServer } from 'node:http'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dataDir = join(root, 'data')
const usersFile = join(dataDir, 'users.json')
const secret = process.env.RIDE_SESSION_SECRET || 'ride-local-development-secret-change-before-production'
const port = Number(process.env.PORT || 8788)

await mkdir(dataDir, { recursive: true })
try { await readFile(usersFile) } catch { await writeFile(usersFile, '[]') }
const readUsers = async () => JSON.parse(await readFile(usersFile, 'utf8'))
const saveUsers = async (users) => writeFile(usersFile, JSON.stringify(users, null, 2))
const publicUser = ({ passwordHash, ...user }) => user
const hashPassword = (password, salt = randomBytes(16).toString('hex')) => `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
const verifyPassword = (password, stored) => { const [salt, hash] = stored.split(':'); return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64)) }
const sign = (user) => { const payload = Buffer.from(JSON.stringify({ sub:user.id, exp:Date.now()+7*86400000 })).toString('base64url'); const signature = createHmac('sha256', secret).update(payload).digest('base64url'); return `${payload}.${signature}` }
const verifyToken = (token) => { try { const [payload, signature] = token.split('.'); const expected=createHmac('sha256',secret).update(payload).digest(); if(!timingSafeEqual(Buffer.from(signature,'base64url'),expected)) return null; const data=JSON.parse(Buffer.from(payload,'base64url')); return data.exp>Date.now()?data:null } catch { return null } }
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS' }); res.end(JSON.stringify(data)) }
const body = async (req) => { const chunks=[]; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString()||'{}') }

createServer(async (req,res) => {
  if(req.method==='OPTIONS') return send(res,204,{})
  try {
    if(req.url==='/api/register' && req.method==='POST') {
      const { name='',email='',phone='',password='',role='' }=await body(req)
      const cleanEmail=String(email).trim().toLowerCase()
      if(String(name).trim().length<3 || !cleanEmail.includes('@') || String(phone).trim().length<8 || String(password).length<8 || !['passenger','driver'].includes(role)) return send(res,400,{message:'Revisa los datos. La contraseña debe tener mínimo 8 caracteres.'})
      const users=await readUsers(); if(users.some((u)=>u.email===cleanEmail)) return send(res,409,{message:'Este correo ya tiene una cuenta.'})
      const user={id:randomUUID(),name:String(name).trim(),email:cleanEmail,phone:String(phone).trim(),role,mustChangePassword:false,passwordHash:hashPassword(String(password)),createdAt:new Date().toISOString()}
      users.push(user); await saveUsers(users); return send(res,201,{user:publicUser(user),token:sign(user)})
    }
    if(req.url==='/api/login' && req.method==='POST') {
      const {email='',password=''}=await body(req); const users=await readUsers(); const user=users.find((u)=>u.email===String(email).trim().toLowerCase())
      if(!user || !verifyPassword(String(password),user.passwordHash)) return send(res,401,{message:'Correo o contraseña incorrectos.'})
      return send(res,200,{user:publicUser(user),token:sign(user)})
    }
    if(req.url==='/api/me' && req.method==='GET') {
      const token=(req.headers.authorization||'').replace('Bearer ',''); const session=verifyToken(token)
      if(!session) return send(res,401,{message:'Sesión inválida.'}); const users=await readUsers(); const user=users.find((u)=>u.id===session.sub)
      return user?send(res,200,{user:publicUser(user)}):send(res,404,{message:'Usuario no encontrado.'})
    }
    if(req.url==='/api/change-password' && req.method==='POST') {
      const token=(req.headers.authorization||'').replace('Bearer ',''); const session=verifyToken(token)
      if(!session) return send(res,401,{message:'Debes iniciar sesión.'})
      const {password=''}=await body(req); if(String(password).length<10) return send(res,400,{message:'La nueva contraseña debe tener mínimo 10 caracteres.'})
      const users=await readUsers(); const user=users.find((u)=>u.id===session.sub)
      if(!user) return send(res,404,{message:'Usuario no encontrado.'})
      if(!['admin','superadmin'].includes(user.role)) return send(res,403,{message:'Este flujo es exclusivo para cuentas administrativas.'})
      user.passwordHash=hashPassword(String(password)); user.mustChangePassword=false; user.passwordChangedAt=new Date().toISOString(); await saveUsers(users)
      return send(res,200,{user:publicUser(user),token:sign(user)})
    }
    if(req.url==='/api/admin/users' && req.method==='GET') {
      const token=(req.headers.authorization||'').replace('Bearer ',''); const session=verifyToken(token)
      if(!session) return send(res,401,{message:'Debes iniciar sesión.'})
      const users=await readUsers(); const admin=users.find((u)=>u.id===session.sub)
      if(!admin || !['admin','superadmin'].includes(admin.role) || admin.mustChangePassword) return send(res,403,{message:'No tienes permiso para ver este contenido.'})
      const visibleUsers=admin.role==='superadmin'?users:users.filter((u)=>u.role!=='superadmin')
      return send(res,200,{users:visibleUsers.map(publicUser)})
    }
    send(res,404,{message:'Ruta no encontrada.'})
  } catch { send(res,500,{message:'No se pudo procesar la solicitud.'}) }
}).listen(port,()=>console.log(`Ride API disponible en http://localhost:${port}`))
