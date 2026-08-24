import { createServer } from 'node:http'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHmac } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const dataDir = join(root, 'data')
const usersFile = join(dataDir, 'users.json')
const secret = process.env.RIDE_SESSION_SECRET || 'ride-local-development-secret-change-before-production'
const port = Number(process.env.PORT || 8787)

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
      const user={id:randomUUID(),name:String(name).trim(),email:cleanEmail,phone:String(phone).trim(),role,passwordHash:hashPassword(String(password)),createdAt:new Date().toISOString()}
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
    send(res,404,{message:'Ruta no encontrada.'})
  } catch { send(res,500,{message:'No se pudo procesar la solicitud.'}) }
}).listen(port,()=>console.log(`Ride API disponible en http://localhost:${port}`))
