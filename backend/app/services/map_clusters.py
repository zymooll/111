from __future__ import annotations

import math
from collections import defaultdict
from typing import Any


def merchant_geojson(
    merchants: list[dict[str, Any]],
    *,
    zoom: int,
    cluster_pixels: int = 48,
) -> dict[str, Any]:
    """Return GCJ-02 GeoJSON using a Web-Mercator pixel grid at low zoom."""
    if zoom >= 18:
        features = [_point_feature(item) for item in merchants]
    else:
        buckets: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
        scale = 256 * (2**zoom)
        for merchant in merchants:
            x, y = _world_pixel(
                merchant["gcj02_longitude"], merchant["gcj02_latitude"], scale
            )
            buckets[(int(x // cluster_pixels), int(y // cluster_pixels))].append(merchant)
        features = []
        for members in buckets.values():
            if len(members) == 1:
                features.append(_point_feature(members[0]))
                continue
            longitude = sum(item["gcj02_longitude"] for item in members) / len(members)
            latitude = sum(item["gcj02_latitude"] for item in members) / len(members)
            features.append(
                {
                    "type": "Feature",
                    "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
                    "properties": {
                        "kind": "cluster",
                        "count": len(members),
                        "has_favorite": any(item["is_favorite"] for item in members),
                        "merchant_ids": [item["id"] for item in members],
                        "bounds": _bounds(members),
                    },
                }
            )
    return {
        "type": "FeatureCollection",
        "coordinate_system": "GCJ-02",
        "features": features,
    }


def _point_feature(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "Feature",
        "geometry": {
            "type": "Point",
            "coordinates": [item["gcj02_longitude"], item["gcj02_latitude"]],
        },
        "properties": {
            "kind": "merchant",
            "id": item["id"],
            "name": item["name"],
            "address": item["address"],
            "price_level": item["price_level"],
            "rating_avg": item["rating_avg"],
            "is_favorite": item["is_favorite"],
            "category_id": item["category_id"],
        },
    }


def _world_pixel(longitude: float, latitude: float, scale: float) -> tuple[float, float]:
    x = (longitude + 180.0) / 360.0 * scale
    sin_lat = math.sin(math.radians(max(min(latitude, 85.05112878), -85.05112878)))
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * scale
    return x, y


def _bounds(items: list[dict[str, Any]]) -> list[float]:
    longitudes = [item["gcj02_longitude"] for item in items]
    latitudes = [item["gcj02_latitude"] for item in items]
    return [min(longitudes), min(latitudes), max(longitudes), max(latitudes)]
