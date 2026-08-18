import uuid
from datetime import datetime, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException

from core.database import db

MUTATING = {'POST', 'PUT', 'PATCH', 'DELETE'}
SKIP_PREFIXES = ('/api/auth/login', '/api/activity', '/api/scheduler')


def init_activity_middleware(app, secret_key, algorithm):
    @app.middleware("http")
    async def activity_middleware(request, call_next):
        response = await call_next(request)
        try:
            path = request.url.path
            if (request.method in MUTATING and path.startswith('/api/')
                    and not path.startswith(SKIP_PREFIXES)
                    and 200 <= response.status_code < 300):
                user_id = user_name = user_role = None
                auth = request.headers.get('authorization') or ''
                if auth.lower().startswith('bearer '):
                    try:
                        payload = jwt.decode(auth[7:], secret_key, algorithms=[algorithm])
                        user_id = payload.get('sub')
                    except jwt.PyJWTError:
                        pass
                if user_id:
                    u = await db.users.find_one({'id': user_id}, {'_id': 0, 'name': 1, 'role': 1})
                    if u:
                        user_name, user_role = u.get('name'), u.get('role')
                segs = [s for s in path.split('/') if s]
                entity = segs[1] if len(segs) > 1 else ''
                if entity in ('operations', 'reports') and len(segs) > 2:
                    entity = segs[2]
                entity_id = next((s for s in segs if len(s) == 36 and s.count('-') == 4), None)
                action = {'POST': 'create', 'PUT': 'update', 'PATCH': 'update', 'DELETE': 'delete'}[request.method]
                await db.activity_logs.insert_one({
                    'id': str(uuid.uuid4()),
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'user_id': user_id,
                    'user_name': user_name or 'Sconosciuto',
                    'user_role': user_role,
                    'method': request.method,
                    'path': path,
                    'action': action,
                    'entity_type': entity,
                    'entity_id': entity_id,
                    'status_code': response.status_code,
                })
        except Exception:
            pass
        return response


def create_activity_router(get_current_user):
    router = APIRouter(prefix="/activity", tags=["activity"])

    @router.get("")
    async def list_activity(
        action: Optional[str] = None,
        entity: Optional[str] = None,
        user_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
        current_user: dict = Depends(get_current_user),
    ):
        if current_user.get('role') not in ('admin', 'operations_manager'):
            raise HTTPException(status_code=403, detail="Non autorizzato")
        q = {}
        if action and action != 'all':
            q['action'] = action
        if entity and entity != 'all':
            q['entity_type'] = entity
        if user_id:
            q['user_id'] = user_id
        total = await db.activity_logs.count_documents(q)
        items = await db.activity_logs.find(q, {'_id': 0}).sort('timestamp', -1).skip(max(skip, 0)).limit(min(limit, 200)).to_list(200)
        entities = await db.activity_logs.distinct('entity_type')
        return {'items': items, 'total': total, 'entities': sorted(e for e in entities if e)}

    return router
