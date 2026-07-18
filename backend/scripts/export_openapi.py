from __future__ import annotations

import copy
import json
from pathlib import Path

from app.main import app


def filtered_spec(spec: dict, prefix: str, title: str) -> dict:
    result = copy.deepcopy(spec)
    result["info"]["title"] = title
    result["paths"] = {
        path: value for path, value in spec["paths"].items() if path.startswith(prefix)
    }
    return result


def main() -> None:
    output = Path("generated")
    output.mkdir(parents=True, exist_ok=True)
    spec = app.openapi()
    documents = {
        "openapi.json": spec,
        "openapi-user.json": filtered_spec(spec, "/api/v1", "Campus Foodie User API"),
        "openapi-admin.json": filtered_spec(
            spec, "/admin/api/v1", "Campus Foodie Admin API"
        ),
    }
    for filename, document in documents.items():
        (output / filename).write_text(
            json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(f"Exported {len(documents)} OpenAPI documents to {output.resolve()}")


if __name__ == "__main__":
    main()
