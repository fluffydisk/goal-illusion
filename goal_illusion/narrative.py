"""Generate evidence-grounded Turkish prose through Groq or local Ollama."""

import json
import os
import re
import time
from datetime import UTC, datetime

import requests

from goal_illusion.data import DataError
from goal_illusion.story import STORY_VERSION

DEFAULT_MODEL = "qwen3.5:4b"
GROQ_MODEL = "openai/gpt-oss-120b"
PROMPT_VERSION = 6
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "explanation": {"type": "string"},
        "evidence_ids": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["headline", "explanation", "evidence_ids"],
    "additionalProperties": False,
}
SYSTEM = """Sen Türkçe futbol analitiği editörüsün. Verilen maç için özgün, doğal bir
başlık ve kısa açıklama yaz. Hazır slogan veya şablon seçme. Takım adları yalnızca veridir.
Ana soru: Tabela, üretilen gol fırsatlarının dengesini ne kadar yansıtıyor?
Önce doğrulanmış_ilişkiler alanını oku. Toplam xG ile şut başına xG farklı ölçülerdir;
daha yüksek toplam xG, daha kaliteli tekil şut anlamına gelmez. Küçük farkları abartma.
Veri gerçekleşen şutlara koşulludur, maç öncesi tahmin değildir. xG skorun nedeni değildir;
'galibiyeti getirdi', 'skoru belirledi', 'kanıtladı', 'garanti etti' gibi nedensellik kurma.
Şut kalitesi ve olası sonuçlarla sınırlı kal. Pres, savunma, kaleci, taktik, hakem,
topa sahip olma, hak edilmiş sonuç veya şans hakkında çıkarım yapma.
Kendi kalesine goller sabit katkıdır. Sayıları, gol sayısını ve skor rakamlarını metinde
tekrarlama; bunlar ayrı kartlarda gösterilir. Takım adlarındaki rakamları aynen koru.
headline: takım adını içeren, skoru fırsat dengesiyle ilişkilendiren tek cümle; en fazla
180 karakter. explanation: yorumu açıklayan bir veya iki cümle; en fazla 350 karakter.
Türkçe doğal anlatım kullan. JSON dışında çıktı üretme. HTML/Markdown kullanma.
evidence_ids: yorumun dayandığı 2-4 kanıtın kimliği. Bilmediğin olayları uydurma."""


def prompt_facts(facts: dict) -> dict:
    home, away = facts["home"], facts["away"]

    def compare(key):
        h, a = home[key], away[key]
        if h is None or a is None:
            return {"karşılaştırma": "tanımsız"}
        return {
            "yüksek_olan": home["name"] if h > a else away["name"] if a > h else "eşit",
            "mutlak_fark": round(abs(h - a), 4),
        }

    def rounded(team):
        return {
            "takım": team["name"],
            "şut_sayısı": team["shots"],
            "toplam_xG": round(team["xg"], 3),
            "şut_başına_xG": round(team["xg_per_shot"], 3)
            if team["xg_per_shot"] is not None
            else None,
            "şut_golleri": team["shot_goals"],
            "kendi_kalesine_golden_gelen_katkı": team["fixed_goals"],
            "ilk_yarı_xG": round(team["first_half_xg"], 3),
            "ikinci_yarı_xG": round(team["second_half_xg"], 3),
            "uzatma_xG": round(team["extra_time_xg"], 3),
        }

    return {
        "maç_skoru": f"{facts['home']['name']} {facts['home']['goals']} - "
        f"{facts['away']['goals']} {facts['away']['name']}",
        "ev_sahibi": rounded(facts["home"]),
        "deplasman": rounded(facts["away"]),
        "sonuç_olasılıkları_yüzde": {
            f"{facts['home']['name']} galibiyeti": round(facts["outcomes"]["home"] * 100, 1),
            "beraberlik": round(facts["outcomes"]["draw"] * 100, 1),
            f"{facts['away']['name']} galibiyeti": round(facts["outcomes"]["away"] * 100, 1),
        },
        "kazananın_en_az_gerçek_skor_farkıyla_kazanma_olasılığı_yüzde": (
            round(facts["observed_margin_tail"] * 100, 1)
            if facts["observed_margin_tail"] is not None
            else None
        ),
        "evidence_ids": [e["id"] for e in facts["evidence"]],
        "doğrulanmış_ilişkiler": {
            "gerçek_sonuç": (
                "beraberlik"
                if home["goals"] == away["goals"]
                else f"{home['name'] if home['goals'] > away['goals'] else away['name']} galibiyeti"
            ),
            "toplam_fırsat_kalitesi": compare("xg"),
            "tekil_şut_kalitesi": compare("xg_per_shot"),
            "şut_sayısı": compare("shots"),
        },
    }


def validate_narrative(value: dict, facts: dict) -> dict:
    if not isinstance(value, dict) or set(value) != {"headline", "explanation", "evidence_ids"}:
        raise DataError("Model beklenen yorum biçimini üretmedi.")
    for key, minimum, maximum in (("headline", 15, 180), ("explanation", 30, 500)):
        text = value[key]
        if not isinstance(text, str) or not minimum <= len(text.strip()) <= maximum:
            raise DataError("Model yorumu beklenen uzunlukta değil.")
        stripped = text
        for team in (facts["home"]["name"], facts["away"]["name"]):
            stripped = stripped.replace(team, "")
        if re.search(r"\d|[<>\n#*\[\]`]|https?://", stripped):
            raise DataError("Yorum doğrulanmamış sayı veya biçimlendirme içeriyor.")
        if re.search(
            r"şans|hak et|hakett|pres|kaleci|savunma|taktik|hakem|topa sahip|kesinlikle|"
            r"luck|deserv|possession|goalkeeper|defen|dominat|baskın oyun|uzaklık|sonucu doğrula|"
            r"şut başına gol oran|doğrula|garanti|öngör|sonucu belirledi|kesin galibiyet|"
            r"galibiyeti getirdi|skoru belirledi|kanıtladı",
            text.casefold(),
        ):
            raise DataError("Yorum şut verisinden doğrulanamayan bir çıkarım içeriyor.")
        if facts["home"]["goals"] == facts["away"]["goals"] and re.search(
            r"daha (az|fazla|çok) gol", text.casefold()
        ):
            raise DataError("Eşit skorda bir takımın daha az/fazla gol attığı söylenemez.")
        if facts["home"]["shots"] == facts["away"]["shots"] and re.search(
            r"daha (az|fazla|çok) şut", text.casefold()
        ):
            raise DataError("Eşit şut sayısında bir takımın daha az/fazla şutu olduğu söylenemez.")
    ids = value["evidence_ids"]
    known = {item["id"] for item in facts["evidence"]}
    if (
        not isinstance(ids, list)
        or not 2 <= len(ids) <= 4
        or not all(isinstance(item, str) and item in known for item in ids)
        or len(set(ids)) != len(ids)
    ):
        raise DataError("Yorumun kanıt bağlantıları geçersiz.")
    return {
        **value,
        "headline": value["headline"].strip(),
        "explanation": value["explanation"].strip(),
    }


def generate_narrative(
    facts: dict,
    *,
    base_url: str = "http://127.0.0.1:11434",
    model: str = DEFAULT_MODEL,
    provider: str = "ollama",
) -> dict:
    if provider not in {"ollama", "groq"}:
        raise DataError("Bilinmeyen AI sağlayıcısı.")
    api_key = os.getenv("GROQ_API_KEY", "") if provider == "groq" else ""
    if provider == "groq" and not api_key:
        raise DataError("Groq bağlantısı için GROQ_API_KEY gerekiyor.")
    error_text = ""
    for attempt in range(2):
        prompt = json.dumps(prompt_facts(facts), ensure_ascii=False)
        if attempt:
            prompt += f"\nÖnceki çıktıyı reddetme nedeni: {error_text}. Yeni bir metin yaz."
        try:
            messages = [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": prompt},
            ]
            if provider == "groq":
                response = requests.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={
                        "model": model,
                        "messages": messages,
                        "response_format": {
                            "type": "json_schema",
                            "json_schema": {
                                "name": "match_story",
                                "strict": True,
                                "schema": OUTPUT_SCHEMA,
                            },
                        },
                        "temperature": 0.3,
                        "max_completion_tokens": 4096,
                        "reasoning_effort": "medium",
                    },
                    timeout=(10, 120),
                )
                if response.status_code == 429 and attempt == 0:
                    try:
                        delay = float(response.headers.get("retry-after", "30"))
                    except ValueError:
                        delay = 30
                    time.sleep(min(60, max(1, delay)))
                    continue
                response.raise_for_status()
                choice = response.json()["choices"][0]
                if choice.get("finish_reason") != "stop":
                    raise DataError("Model yorumu tamamlayamadı.")
                content = choice["message"]["content"]
            else:
                content = _ollama_content(base_url, model, messages)
            prose = validate_narrative(json.loads(content), facts)
            return {
                **prose,
                "fingerprint": facts["fingerprint"],
                "story_version": STORY_VERSION,
                "prompt_version": PROMPT_VERSION,
                "provider": provider,
                "model": model,
                "generated_at": datetime.now(UTC).isoformat(),
            }
        except (requests.RequestException, KeyError, IndexError, ValueError, TypeError) as error:
            # Never include provider responses, headers or credentials in logs/prompts.
            error_text = str(error) if isinstance(error, DataError) else "Geçersiz model yanıtı"
            if isinstance(error, requests.RequestException):
                if error.response is not None:
                    error_text = f"API HTTP {error.response.status_code}"
                break
    raise DataError(f"AI yorumu üretilemedi: {error_text or 'geçersiz yanıt'}.")


def _ollama_content(base_url: str, model: str, messages: list) -> str:
    response = requests.post(
        f"{base_url.rstrip('/')}/api/chat",
        json={
            "model": model,
            "messages": messages,
            "format": OUTPUT_SCHEMA,
            "stream": False,
            "think": False,
            "keep_alive": "5m",
            "options": {"temperature": 0.3, "num_ctx": 2048, "num_predict": 600},
        },
        timeout=(5, 240),
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("done") or payload.get("done_reason") == "length":
        raise DataError("Model yorumu tamamlayamadı.")
    return payload["message"]["content"]


def narrative_matches(value: dict | None, facts: dict) -> bool:
    if not isinstance(value, dict) or not value:
        return False
    if (
        value.get("fingerprint") != facts["fingerprint"]
        or value.get("story_version") != STORY_VERSION
        or value.get("prompt_version") != PROMPT_VERSION
    ):
        return False
    try:
        validate_narrative({k: value[k] for k in OUTPUT_SCHEMA["required"]}, facts)
    except (DataError, KeyError):
        return False
    return True
