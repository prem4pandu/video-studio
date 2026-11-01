#!/usr/bin/env python3
"""Build studio-v2/curriculum-seed.json from the KooBits lesson catalog CSV.

IP hygiene: only Subject / Topic / Lesson-or-skill / Age range / Activity type
are carried over. Video titles, YouTube URLs, KooBits URLs and skill IDs are
deliberately dropped.
"""
import csv
import json
from collections import OrderedDict
from pathlib import Path

CSV_PATH = Path(
    "/Users/premkumarmamidi/Development/koobits-cross-subject-research-2026-10-20/"
    "koobits-master-video-links.csv"
)
OUT_PATH = Path(__file__).with_name("curriculum-seed.json")


def age(value):
    value = (value or "").strip()
    return int(value) if value.isdigit() else None


def main():
    with CSV_PATH.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    subjects = {}
    lesson_keys = set()          # (subject, topic, lesson) dedupe
    demos_skipped = 0

    for row in rows:
        if row["Record type"].strip() != "lesson_video":
            demos_skipped += 1
            continue

        subject = row["Subject"].strip() or "Unknown"
        topic = row["Topic"].strip() or "General"
        lesson = row["Lesson or skill"].strip() or topic
        activity = row["Activity type"].strip()
        a_min, a_max = age(row["Age min"]), age(row["Age max"])

        topics = subjects.setdefault(subject, {}).setdefault("topics", {})
        t = topics.setdefault(topic, {"lessons": OrderedDict()})

        key = (subject, topic, lesson)
        if key not in lesson_keys:
            lesson_keys.add(key)
            t["lessons"][lesson] = {
                "title": lesson,
                "activityTypes": [],
                "ageMin": a_min,
                "ageMax": a_max,
            }
        entry = t["lessons"][lesson]
        if activity and activity not in entry["activityTypes"]:
            entry["activityTypes"].append(activity)
        # Widen the lesson age range if later rows carry more info.
        for fld, val in (("ageMin", a_min), ("ageMax", a_max)):
            if entry[fld] is None and val is not None:
                entry[fld] = val

    # Finalize: topic ages = envelope of lesson ages; lessons list-ified.
    for subj in subjects.values():
        for t in subj["topics"].values():
            lessons = list(t["lessons"].values())
            mins = [l["ageMin"] for l in lessons if l["ageMin"] is not None]
            maxs = [l["ageMax"] for l in lessons if l["ageMax"] is not None]
            t["ageMin"] = min(mins) if mins else None
            t["ageMax"] = max(maxs) if maxs else None
            t["lessons"] = lessons
        subj["topics"] = dict(
            sorted(subj["topics"].items(), key=lambda kv: kv[0])
        )

    seed = {
        "source": "derived from KooBits public lesson catalog (topics/ages only)",
        "subjects": dict(sorted(subjects.items())),
        "teachingBeats": [
            "hook", "goal", "model", "predict", "example",
            "practice", "misconception", "transfer", "recap",
        ],
        "lessonLoop": [
            "diagnose prerequisite and misconception",
            "hook with a meaningful problem, phenomenon or story",
            "state a child-readable learning goal",
            "explain with one coherent visual model",
            "pause for prediction before revealing",
            "model one worked example with narrated reasoning",
            "do-with-me interaction with hints that fade",
            "independent check with misconception-specific feedback",
            "transfer to a new context or representation",
            "retrieval recap and scheduled later review",
        ],
        "subjectGrammars": {
            "Math": "concrete to pictorial to symbolic; worked examples; variation; multiple strategies; reasoning aloud; common-error contrast",
            "Science": "phenomenon to prediction to evidence/investigation to model to claim-evidence-reasoning; explicit vocabulary; distinguish observation from inference; show model limits and safety",
            "English": "meaning in context; pronunciation/decoding; fluent model; vocabulary morphology; text evidence; discussion; guided-to-independent writing",
            "Chinese": "form-sound-meaning linkage; tone and listening discrimination; pinyin scaffolding that fades; radicals and components; stroke animation; receptive practice then spoken/written production",
        },
        "ageBands": {
            "4-6": {
                "unitMinutes": [2, 4],
                "principles": [
                    "one idea per scene",
                    "concrete manipulation",
                    "immediate feedback",
                    "minimal text",
                ],
            },
            "7-10": {
                "unitMinutes": [4, 7],
                "principles": [
                    "guided prediction",
                    "dual representations",
                    "short independent check",
                ],
            },
            "11-12": {
                "unitMinutes": [6, 9],
                "principles": [
                    "misconception contrasts",
                    "learner explanations",
                    "multi-step transfer",
                ],
            },
            "13-15": {
                "unitMinutes": [7, 12],
                "principles": [
                    "abstraction",
                    "evidence evaluation",
                    "multiple solution paths",
                    "reflection and spaced retrieval",
                ],
            },
        },
    }

    OUT_PATH.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n")

    # Summary
    total_lessons = 0
    print(f"wrote {OUT_PATH}")
    print(f"platform_demo rows skipped: {demos_skipped}")
    print(f"subjects: {len(seed['subjects'])}")
    for name, s in seed["subjects"].items():
        n_topics = len(s["topics"])
        n_lessons = sum(len(t["lessons"]) for t in s["topics"].values())
        total_lessons += n_lessons
        no_age = sum(
            1 for t in s["topics"].values() for l in t["lessons"]
            if l["ageMin"] is None
        )
        print(f"  {name}: {n_topics} topics, {n_lessons} lessons "
              f"({no_age} lessons without age range)")
    print(f"total lessons: {total_lessons}")
    print("\nsample entries:")
    for name, s in seed["subjects"].items():
        topic = next(iter(s["topics"].items()))
        print(f"  {name} -> {topic[0]}:")
        print(f"    {json.dumps(topic[1], ensure_ascii=False)[:400]}")


if __name__ == "__main__":
    main()
