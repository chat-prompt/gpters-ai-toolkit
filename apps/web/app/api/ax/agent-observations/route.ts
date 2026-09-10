import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/core/auth'
import { resolveAxViewer, observationQuerySchema, observationRange, loadAgentObservations } from '@/lib/features/ax'
import { withRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'
import type { UserRole } from '@/lib/security/rbac'
export const maxDuration = 60
const headers={'Cache-Control':'private, no-store'}
const failure=(message:string,status:number)=>NextResponse.json({message},{status,headers})
export async function GET(request:NextRequest){
  const limited=withRateLimit(request,RateLimitPresets.standard);if(limited)return limited
  const session=await auth(),viewer=resolveAxViewer({email:session?.user?.email,role:session?.user?.role as UserRole})
  if(!viewer.canAccess||!viewer.isAdmin)return failure('사내 관리자 로그인이 필요합니다',403)
  const params=new URL(request.url).searchParams,raw:Record<string,string>={}
  for(const [key,value]of params){if(key in raw)return failure('중복된 조회 조건입니다',400);raw[key]=value}
  const parsed=observationQuerySchema.safeParse(raw);if(!parsed.success)return failure('조회 기간·에이전트·소스·비교 조건을 확인하세요',400)
  const now=new Date()
  try{observationRange(parsed.data,now)}catch{return failure('비교 구간은 현재 이전의 조회 기간 안에 있어야 합니다',400)}
  try{return NextResponse.json(await loadAgentObservations(parsed.data,now),{headers})}
  catch{return failure('관측 지표를 불러오지 못했습니다',500)}
}
