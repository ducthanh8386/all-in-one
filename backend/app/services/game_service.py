"""
Redis-backed game service for the real-time Concept Association arena.
"""

from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import google.generativeai as genai
import redis.asyncio as redis

from app.core.config import settings

WAITING = "WAITING"
WRITING = "WRITING"
VOTING = "VOTING"
RESULT = "RESULT"
ENDED = "ENDED"
AI_BOT = "AI_BOT"

MIN_PLAYERS = 2
MAX_PLAYERS = 8
MAX_ROUNDS = 3
WRITING_SECONDS = 60
VOTING_SECONDS = 30

FALLBACK_KEYWORDS = [
    ("Entropy", "A measure of disorder, uncertainty, or unavailable energy in a system."),
    ("Deadlock", "A state where processes wait forever because each holds a resource another needs."),
    ("Gradient", "A vector that points in the direction of the steepest increase of a function."),
    ("Normalization", "The process of organizing data to reduce redundancy and improve consistency."),
    ("Polymorphism", "The ability for different types to be treated through a shared interface."),
]

SCORE_VOTE_SCRIPT = """
local votes_key = KEYS[1]
local scores_key = KEYS[2]
local voter_id = ARGV[1]
local voted_for = ARGV[2]
local ai_bot = ARGV[3]

if redis.call('HEXISTS', votes_key, voter_id) == 1 then
  return 0
end

redis.call('HSET', votes_key, voter_id, voted_for)

if voted_for == ai_bot then
  redis.call('ZINCRBY', scores_key, 3, voter_id)
elseif voted_for ~= voter_id then
  redis.call('ZINCRBY', scores_key, 1, voted_for)
end

return 1
"""


@dataclass(frozen=True)
class KeywordDefinition:
    keyword: str
    definition: str


def room_key(room_id: str) -> str:
    return f"room:{room_id}"


def players_key(room_id: str) -> str:
    return f"room:{room_id}:players"


def player_names_key(room_id: str) -> str:
    return f"room:{room_id}:player_names"


def answers_key(room_id: str) -> str:
    return f"room:{room_id}:answers"


def votes_key(room_id: str) -> str:
    return f"room:{room_id}:votes"


def scores_key(room_id: str) -> str:
    return f"room:{room_id}:scores"


def timer_key(room_id: str) -> str:
    return f"room:{room_id}:timer"


def _now_ts() -> int:
    return int(time.time())


def make_room_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(6))


async def generate_keyword() -> KeywordDefinition:
    """
    Generate a keyword and real definition for a round.
    Falls back to local study terms when GEMINI_API_KEY is not configured.
    """
    if not settings.gemini_api_key:
        keyword, definition = random.choice(FALLBACK_KEYWORDS)
        return KeywordDefinition(keyword=keyword, definition=definition)

    prompt = (
        "Create one difficult university study concept for a bluffing definition game. "
        "Return ONLY JSON with keys keyword and definition. "
        "The definition must be accurate, concise, and under 40 words."
    )
    try:
        genai.configure(api_key=settings.gemini_api_key)
        response = genai.GenerativeModel("gemini-1.5-flash").generate_content(prompt)
        data = json.loads((response.text or "").strip())
        return KeywordDefinition(
            keyword=str(data["keyword"]).strip(),
            definition=str(data["definition"]).strip(),
        )
    except Exception:
        keyword, definition = random.choice(FALLBACK_KEYWORDS)
        return KeywordDefinition(keyword=keyword, definition=definition)


async def room_exists(client: redis.Redis, room_id: str) -> bool:
    return bool(await client.exists(room_key(room_id)))


async def create_room(
    client: redis.Redis,
    room_id: str,
    host_id: str,
    host_name: str,
) -> Dict[str, Any]:
    await client.hset(
        room_key(room_id),
        mapping={
            "status": WAITING,
            "host_id": host_id,
            "current_keyword": "",
            "round": 0,
            "max_rounds": MAX_ROUNDS,
        },
    )
    await add_player(client, room_id, host_id, host_name)
    return await get_room_state(client, room_id)


async def add_player(
    client: redis.Redis,
    room_id: str,
    user_id: str,
    username: str,
) -> Dict[str, Any]:
    state = await client.hgetall(room_key(room_id))
    if not state:
        return await create_room(client, room_id, user_id, username)

    status = state.get("status", WAITING)
    already_joined = bool(await client.sismember(players_key(room_id), user_id))
    player_count = await client.scard(players_key(room_id))

    if not already_joined and player_count >= MAX_PLAYERS:
        raise ValueError("ROOM_FULL")
    if status not in {WAITING, WRITING, VOTING, RESULT}:
        raise ValueError("ROOM_CLOSED")

    await client.sadd(players_key(room_id), user_id)
    await client.hset(player_names_key(room_id), user_id, username)
    await client.zadd(scores_key(room_id), {user_id: 0}, nx=True)
    return await get_room_state(client, room_id)


async def remove_player(client: redis.Redis, room_id: str, user_id: str) -> Dict[str, Any]:
    await client.srem(players_key(room_id), user_id)
    return await get_room_state(client, room_id)


async def start_round(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    state = await client.hgetall(room_key(room_id))
    if not state:
        raise ValueError("ROOM_NOT_FOUND")

    current_round = int(state.get("round") or 0) + 1
    max_rounds = int(state.get("max_rounds") or MAX_ROUNDS)
    if current_round > max_rounds:
        await client.hset(room_key(room_id), "status", ENDED)
        return await get_room_state(client, room_id)

    keyword = await generate_keyword()
    await client.delete(answers_key(room_id), votes_key(room_id))
    await client.hset(
        room_key(room_id),
        mapping={
            "status": WRITING,
            "current_keyword": keyword.keyword,
            "round": current_round,
        },
    )
    await client.hset(answers_key(room_id), AI_BOT, keyword.definition)
    deadline = _now_ts() + WRITING_SECONDS
    await client.set(timer_key(room_id), deadline, ex=WRITING_SECONDS + 5)
    return await get_room_state(client, room_id)


async def submit_definition(
    client: redis.Redis,
    room_id: str,
    user_id: str,
    text: str,
) -> bool:
    state = await client.hgetall(room_key(room_id))
    if state.get("status") != WRITING:
        return False
    clean_text = text.strip()
    if not clean_text:
        return False
    await client.hset(answers_key(room_id), user_id, clean_text[:500])
    return await all_active_players_submitted(client, room_id)


async def all_active_players_submitted(client: redis.Redis, room_id: str) -> bool:
    players = await client.smembers(players_key(room_id))
    answers = await client.hkeys(answers_key(room_id))
    submitted = set(answers) - {AI_BOT}
    return bool(players) and set(players).issubset(submitted)


async def enter_voting_phase(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    await client.hset(room_key(room_id), "status", VOTING)
    deadline = _now_ts() + VOTING_SECONDS
    await client.set(timer_key(room_id), deadline, ex=VOTING_SECONDS + 5)
    return await get_room_state(client, room_id)


async def submit_vote(
    client: redis.Redis,
    room_id: str,
    voter_id: str,
    voted_for: str,
) -> bool:
    state = await client.hgetall(room_key(room_id))
    if state.get("status") != VOTING:
        return False
    answers = await client.hkeys(answers_key(room_id))
    if voted_for not in answers:
        return False
    result = await client.eval(
        SCORE_VOTE_SCRIPT,
        2,
        votes_key(room_id),
        scores_key(room_id),
        voter_id,
        voted_for,
        AI_BOT,
    )
    return bool(result)


async def all_active_players_voted(client: redis.Redis, room_id: str) -> bool:
    players = await client.smembers(players_key(room_id))
    votes = await client.hkeys(votes_key(room_id))
    return bool(players) and set(players).issubset(set(votes))


async def enter_result_phase(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    await client.hset(room_key(room_id), "status", RESULT)
    await client.delete(timer_key(room_id))
    return await get_room_state(client, room_id)


async def end_game(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    await client.hset(room_key(room_id), "status", ENDED)
    await client.delete(timer_key(room_id))
    return await get_room_state(client, room_id)


async def cancel_game(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    await client.hset(room_key(room_id), "status", ENDED)
    await client.delete(timer_key(room_id))
    return await get_room_state(client, room_id)


async def get_room_state(client: redis.Redis, room_id: str) -> Dict[str, Any]:
    room = await client.hgetall(room_key(room_id))
    if not room:
        return {}

    players = sorted(await client.smembers(players_key(room_id)))
    names = await client.hgetall(player_names_key(room_id))
    score_rows = await client.zrevrange(scores_key(room_id), 0, -1, withscores=True)
    score_map = {player_id: int(score) for player_id, score in score_rows}
    answers = await client.hgetall(answers_key(room_id))
    votes = await client.hgetall(votes_key(room_id))
    deadline = await client.get(timer_key(room_id))

    definitions = [
        {"id": answer_id, "text": text}
        for answer_id, text in answers.items()
    ]
    random.shuffle(definitions)

    return {
        "room_id": room_id,
        "status": room.get("status", WAITING),
        "host_id": room.get("host_id", ""),
        "keyword": room.get("current_keyword", ""),
        "round": int(room.get("round") or 0),
        "max_rounds": int(room.get("max_rounds") or MAX_ROUNDS),
        "deadline": int(deadline) if deadline else None,
        "players": [
            {
                "id": player_id,
                "name": names.get(player_id, player_id),
                "score": score_map.get(player_id, 0),
            }
            for player_id in players
        ],
        "definitions": definitions,
        "scores": [
            {
                "id": player_id,
                "name": names.get(player_id, player_id),
                "score": int(score),
            }
            for player_id, score in score_rows
        ],
        "votes_breakdown": [
            {"voter_user_id": voter, "voted_for_user_id": target}
            for voter, target in votes.items()
        ],
        "correct_answer_owner": AI_BOT,
    }


async def list_public_rooms(client: redis.Redis) -> List[Dict[str, Any]]:
    rooms: List[Dict[str, Any]] = []
    async for key in client.scan_iter(match="room:*"):
        suffix = key.split(":", 2)
        if len(suffix) != 2:
            continue
        room_id = suffix[1]
        state = await get_room_state(client, room_id)
        if state and state["status"] in {WAITING, WRITING, VOTING, RESULT}:
            rooms.append(
                {
                    "room_id": room_id,
                    "status": state["status"],
                    "players_count": len(state["players"]),
                    "round": state["round"],
                    "max_rounds": state["max_rounds"],
                }
            )
    return sorted(rooms, key=lambda item: item["room_id"])
