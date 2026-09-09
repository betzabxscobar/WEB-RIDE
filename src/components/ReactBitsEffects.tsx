import { useEffect, useState } from 'react'

type Spark = { id:number; x:number; y:number }

/** Interacciones inspiradas en los componentes gratuitos de React Bits:
 * Click Spark, Spotlight Card, Aurora y Floating Lines, adaptadas a Ride. */
export function ReactBitsEffects(){
  const [sparks,setSparks]=useState<Spark[]>([])
  useEffect(()=>{
    let id=0
    const move=(event:PointerEvent)=>{
      document.documentElement.style.setProperty('--ride-pointer-x',`${event.clientX}px`)
      document.documentElement.style.setProperty('--ride-pointer-y',`${event.clientY}px`)
    }
    const click=(event:MouseEvent)=>{
      const next={id:++id,x:event.clientX,y:event.clientY}
      setSparks(current=>[...current.slice(-4),next])
      window.setTimeout(()=>setSparks(current=>current.filter(item=>item.id!==next.id)),620)
    }
    window.addEventListener('pointermove',move,{passive:true});window.addEventListener('click',click)
    return()=>{window.removeEventListener('pointermove',move);window.removeEventListener('click',click)}
  },[])
  return <div className="react-bits-layer" aria-hidden="true"><div className="bits-aurora"/><div className="bits-orb orb-a"/><div className="bits-orb orb-b"/>{sparks.map(s=><span className="bits-click-spark" style={{left:s.x,top:s.y}} key={s.id}>{Array.from({length:8},(_,i)=><i style={{'--spark-i':i} as React.CSSProperties} key={i}/>)}</span>)}</div>
}
