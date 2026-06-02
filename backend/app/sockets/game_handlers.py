"""
Socket.io event handlers for the real-time Concept Association arena.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional

from app.core.redis import get_redis_client
from app.core.security import decode_token
from app.services import game_service

logger = logging.getLogger(__name__)

sid_users: Dict[str, Dict[str, str]] = {}
sid_rooms: Dict[str, str] = {}
expiry_listener_task: Optional[asyncio.Task] = None


def _payload_value(payload: Any, key: str, default: str = "") -> str:
    if isinstance(payload, dict):
        return str(payload.get(key) or default).strip()
    return default


def _sid_user(sid: str) -> Optional[Dict[str, str]]:
    return sid_users.get(sid)


async def _emit_error(sio: Any, sid: str, code: str, message: str) -> None:
    await sio.emit("game_error", {"code": code, "message": message}, to=sid)


async def _emit_room_state(sio: Any, room_id: str, event: str = "game_state_sync") -> None:
    client = await get_redis_client()
    state = await game_service.get_room_state(client, room_id)
    if state:
        await sio.emit(event, state, room=room_id)


async def _handle_timer_expired(sio: Any, room_id: str) -> None:
    try:
        client = await get_redis_client()
        state = await game_service.get_room_state(client, room_id)
        if not state:
            return
        if state.get("status") == game_service.WRITING:
            next_state = await game_service.enter_voting_phase(client, room_id)
            await sio.emit("voting_phase", next_state, room=room_id)
        elif state.get("status") == game_service.VOTING:
            result_state = await game_service.enter_result_phase(client, room_id)
            await sio.emit("round_result", result_state, room=room_id)
    except Exception as exc:
        logger.exception("Timer expiry failed for room %s: %s", room_id, exc)


async def _timer_expiry_listener(sio: Any) -> None:
    client = await get_redis_client()
    try:
        await client.config_set("notify-keyspace-events", "Ex")
    except Exception as exc:
        logger.warning("Could not enable Redis keyspace notifications: %s", exc)

    pubsub = client.pubsub()
    await pubsub.subscribe("__keyevent@0__:expired")
    async for message in pubsub.listen():
        if message.get("type") != "message":
            continue
        expired_key = str(message.get("data") or "")
        if not expired_key.startswith("room:") or not expired_key.endswith(":timer"):
            continue
        room_id = expired_key.split(":")[1]
        await _handle_timer_expired(sio, room_id)


async def setup_socket_handlers(sio: Any) -> None:
    """Register Socket.IO handlers."""
    global expiry_listener_task
    if expiry_listener_task is None or expiry_listener_task.done():
        expiry_listener_task = asyncio.create_task(_timer_expiry_listener(sio))

    @sio.event
    async def connect(sid: str, environ: Dict[str, Any], auth: Optional[Dict[str, Any]]) -> bool:
        token = str((auth or {}).get("token") or "")
        payload = decode_token(token) if token else None
        if not payload:
            logger.warning("Rejected unauthenticated socket connection: %s", sid)
            return False

        user_id = str(payload.get("sub") or "")
        username = str(payload.get("username") or user_id)
        if not user_id:
            logger.warning("Rejected socket connection without subject: %s", sid)
            return False

        sid_users[sid] = {"id": user_id, "name": username}
        logger.info("Socket connected: %s", sid)
        return True

    @sio.event
    async def disconnect(sid: str) -> None:
        user = sid_users.pop(sid, None)
        room_id = sid_rooms.pop(sid, "")
        if not user or not room_id:
            return

        client = await get_redis_client()
        state = await game_service.remove_player(client, room_id, user["id"])
        await sio.emit("player_disconnected", {"user_id": user["id"]}, room=room_id)

        remaining = state.get("players", []) if state else []
        if state and state.get("status") in {game_service.WRITING, game_service.VOTING, game_service.RESULT} and len(remaining) < game_service.MIN_PLAYERS:
            cancelled = await game_service.cancel_game(client, room_id)
            await sio.emit("game_cancelled", cancelled, room=room_id)
        else:
            await sio.emit("player_joined", state, room=room_id)

    @sio.on("join_room")
    async def join_room(sid: str, payload: Any) -> None:
        room_id = _payload_value(payload, "room_id").upper()
        auth_user = _sid_user(sid)
        if not room_id:
            await _emit_error(sio, sid, "VALIDATION_ERROR", "room_id is required.")
            return
        if not auth_user:
            await _emit_error(sio, sid, "UNAUTHORIZED", "Authenticated socket connection required.")
            return

        user_id = auth_user["id"]
        username = auth_user["name"]

        client = await get_redis_client()
        try:
            state = await game_service.add_player(client, room_id, user_id, username)
        except ValueError as exc:
            await _emit_error(sio, sid, str(exc), "Unable to join this room.")
            return

        sid_rooms[sid] = room_id
        await sio.enter_room(sid, room_id)
        await sio.emit("game_state_sync", state, to=sid)
        await sio.emit("player_joined", state, room=room_id)
        await sio.emit("rooms_list", await game_service.list_public_rooms(client))

    @sio.on("list_rooms")
    async def list_rooms(sid: str) -> None:
        client = await get_redis_client()
        await sio.emit("rooms_list", await game_service.list_public_rooms(client), to=sid)

    @sio.on("start_game")
    async def start_game(sid: str, payload: Any) -> None:
        room_id = _payload_value(payload, "room_id").upper()
        user = _sid_user(sid)
        if not room_id or not user:
            await _emit_error(sio, sid, "UNAUTHORIZED", "Join the room before starting.")
            return

        client = await get_redis_client()
        state = await game_service.get_room_state(client, room_id)
        if not state:
            await _emit_error(sio, sid, "ROOM_NOT_FOUND", "Room does not exist.")
            return
        if state["host_id"] != user["id"]:
            await _emit_error(sio, sid, "FORBIDDEN", "Only the host can start the game.")
            return
        if len(state["players"]) < game_service.MIN_PLAYERS:
            await _emit_error(sio, sid, "NOT_ENOUGH_PLAYERS", "At least 2 players are required.")
            return

        next_state = await game_service.start_round(client, room_id)
        if next_state.get("status") == game_service.ENDED:
            await sio.emit("game_over", next_state, room=room_id)
            return
        await sio.emit("game_started", next_state, room=room_id)

    @sio.on("submit_definition")
    async def submit_definition(sid: str, payload: Any) -> None:
        room_id = _payload_value(payload, "room_id").upper()
        text = _payload_value(payload, "text")
        user = _sid_user(sid)
        if not room_id or not user:
            await _emit_error(sio, sid, "UNAUTHORIZED", "Join the room before submitting.")
            return

        client = await get_redis_client()
        all_submitted = await game_service.submit_definition(client, room_id, user["id"], text)
        await _emit_room_state(sio, room_id)
        if all_submitted:
            state = await game_service.enter_voting_phase(client, room_id)
            await sio.emit("voting_phase", state, room=room_id)

    @sio.on("submit_vote")
    async def submit_vote(sid: str, payload: Any) -> None:
        room_id = _payload_value(payload, "room_id").upper()
        voted_for = _payload_value(payload, "voted_for_user_id")
        user = _sid_user(sid)
        if not room_id or not user:
            await _emit_error(sio, sid, "UNAUTHORIZED", "Join the room before voting.")
            return

        client = await get_redis_client()
        accepted = await game_service.submit_vote(client, room_id, user["id"], voted_for)
        if not accepted:
            await _emit_error(sio, sid, "INVALID_VOTE", "Vote was not accepted.")
            return
        if await game_service.all_active_players_voted(client, room_id):
            state = await game_service.enter_result_phase(client, room_id)
            await sio.emit("round_result", state, room=room_id)
        else:
            await _emit_room_state(sio, room_id)

    @sio.on("next_round")
    async def next_round(sid: str, payload: Any) -> None:
        room_id = _payload_value(payload, "room_id").upper()
        user = _sid_user(sid)
        if not room_id or not user:
            await _emit_error(sio, sid, "UNAUTHORIZED", "Join the room before continuing.")
            return

        client = await get_redis_client()
        state = await game_service.get_room_state(client, room_id)
        if not state or state["host_id"] != user["id"]:
            await _emit_error(sio, sid, "FORBIDDEN", "Only the host can advance rounds.")
            return

        next_state = await game_service.start_round(client, room_id)
        if next_state.get("status") == game_service.ENDED:
            await sio.emit("game_over", next_state, room=room_id)
            return
        await sio.emit("game_started", next_state, room=room_id)
