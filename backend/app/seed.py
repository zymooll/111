from __future__ import annotations

from uuid import NAMESPACE_URL, uuid5

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Campus,
    CampusArea,
    Category,
    ItemType,
    MenuItem,
    Merchant,
    Review,
    ReviewStatus,
    Tag,
    User,
    UserProfile,
    UserRole,
)
from app.security import hash_password
from app.seed_catalog import EXTENDED_CATALOG
from app.services.ratings import recalculate_item_rating


DEMO_IDS = {
    "campus": "00000000-0000-0000-0000-000000000001",
    "area_north": "00000000-0000-0000-0000-000000000011",
    "area_north_first": "00000000-0000-0000-0000-000000000012",
    "area_south": "00000000-0000-0000-0000-000000000013",
    "cat_chinese": "00000000-0000-0000-0000-000000000021",
    "cat_rice": "00000000-0000-0000-0000-000000000022",
    "cat_noodle": "00000000-0000-0000-0000-000000000023",
    "cat_light": "00000000-0000-0000-0000-000000000024",
    "cat_snack": "00000000-0000-0000-0000-000000000025",
    "cat_hotpot": "00000000-0000-0000-0000-000000000026",
    "cat_drink": "00000000-0000-0000-0000-000000000027",
    "merchant_one": "00000000-0000-0000-0000-000000000031",
    "merchant_two": "00000000-0000-0000-0000-000000000032",
    "merchant_three": "00000000-0000-0000-0000-000000000033",
    "item_one": "00000000-0000-0000-0000-000000000041",
    "item_two": "00000000-0000-0000-0000-000000000042",
    "item_three": "00000000-0000-0000-0000-000000000043",
    "item_four": "00000000-0000-0000-0000-000000000044",
    "reviewer_one": "00000000-0000-0000-0000-000000000051",
    "reviewer_two": "00000000-0000-0000-0000-000000000052",
    "reviewer_three": "00000000-0000-0000-0000-000000000053",
    "reviewer_four": "00000000-0000-0000-0000-000000000054",
    "reviewer_five": "00000000-0000-0000-0000-000000000055",
    "reviewer_six": "00000000-0000-0000-0000-000000000056",
}


def seed_demo_data(db: Session) -> None:
    if db.get(Campus, DEMO_IDS["campus"]) is not None:
        _refresh_core_demo_catalog(db)
        _seed_extended_catalog(db)
        return
    if db.scalar(select(Campus.id).limit(1)) is not None:
        return

    campus = Campus(
        id=DEMO_IDS["campus"],
        name="中南林业科技大学",
        center_latitude=28.134945,
        center_longitude=112.989306,
    )
    areas = [
        CampusArea(
            id=DEMO_IDS["area_north"],
            campus_id=campus.id,
            name="东园餐饮区",
            level=1,
        ),
        CampusArea(
            id=DEMO_IDS["area_north_first"],
            campus_id=campus.id,
            parent_id=DEMO_IDS["area_north"],
            name="林海餐厅及周边档口",
            level=2,
        ),
        CampusArea(
            id=DEMO_IDS["area_south"],
            campus_id=campus.id,
            name="西园及后街餐饮区",
            level=1,
        ),
    ]
    categories = [
        Category(
            id=DEMO_IDS["cat_chinese"],
            campus_id=campus.id,
            name="中式餐饮",
            icon="bowl",
        ),
        Category(
            id=DEMO_IDS["cat_rice"],
            campus_id=campus.id,
            parent_id=DEMO_IDS["cat_chinese"],
            name="米饭套餐",
            icon="rice",
        ),
        Category(
            id=DEMO_IDS["cat_noodle"],
            campus_id=campus.id,
            parent_id=DEMO_IDS["cat_chinese"],
            name="面食",
            icon="noodle",
        ),
        Category(
            id=DEMO_IDS["cat_light"],
            campus_id=campus.id,
            name="轻食饮品",
            icon="leaf",
        ),
    ]
    tags = [
        Tag(campus_id=campus.id, name="微辣", kind="taste"),
        Tag(campus_id=campus.id, name="酸甜", kind="taste"),
        Tag(campus_id=campus.id, name="清淡", kind="taste"),
        Tag(campus_id=campus.id, name="高蛋白", kind="diet"),
        Tag(campus_id=campus.id, name="素食友好", kind="diet"),
        Tag(campus_id=campus.id, name="米饭", kind="category"),
        Tag(campus_id=campus.id, name="汤面", kind="category"),
        Tag(campus_id=campus.id, name="清爽", kind="taste"),
    ]
    merchants = [
        Merchant(
            id=DEMO_IDS["merchant_one"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_north_first"],
            category_id=DEMO_IDS["cat_rice"],
            name="中南林业科技大学林海餐厅",
            description=(
                "地点信息来自高德 POI B0FFK85GDN（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            address="青园路357号东北80米",
            latitude=28.135160,
            longitude=112.989410,
            gcj02_latitude=28.131782,
            gcj02_longitude=112.995009,
            price_level=1,
            business_hours="07:00-21:00",
        ),
        Merchant(
            id=DEMO_IDS["merchant_two"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_north"],
            category_id=DEMO_IDS["cat_noodle"],
            name="林语餐厅",
            description=(
                "地点信息来自高德 POI B0FFHS6IE6（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            address="中南林业科技大学林大路105号(近常青公寓)",
            latitude=28.136507,
            longitude=112.988280,
            gcj02_latitude=28.133125,
            gcj02_longitude=112.993875,
            price_level=1,
            business_hours="07:00-21:00",
        ),
        Merchant(
            id=DEMO_IDS["merchant_three"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_south"],
            category_id=DEMO_IDS["cat_light"],
            name="中南林业科技大学林苑餐厅",
            description=(
                "地点信息来自高德 POI B0FFH6K3IJ（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            address="中南林业科技大学北门南220米",
            latitude=28.133670,
            longitude=112.987409,
            gcj02_latitude=28.130286,
            gcj02_longitude=112.993001,
            price_level=1,
            business_hours="07:00-21:00",
        ),
    ]
    items = [
        MenuItem(
            id=DEMO_IDS["item_one"],
            campus_id=campus.id,
            merchant_id=DEMO_IDS["merchant_one"],
            category_id=DEMO_IDS["cat_rice"],
            name="番茄牛腩饭",
            description=(
                "演示生成：依据林海餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            item_type=ItemType.COMBO,
            price_cents=1800,
            image_url="/dishes/rice-bowl.svg",
            tags=["酸甜", "高蛋白", "米饭"],
        ),
        MenuItem(
            id=DEMO_IDS["item_two"],
            campus_id=campus.id,
            merchant_id=DEMO_IDS["merchant_one"],
            category_id=DEMO_IDS["cat_rice"],
            name="香辣鸡扒饭",
            description=(
                "演示生成：依据林海餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            item_type=ItemType.COMBO,
            price_cents=1650,
            image_url="/dishes/energy-bowl.svg",
            tags=["微辣", "高蛋白"],
        ),
        MenuItem(
            id=DEMO_IDS["item_three"],
            campus_id=campus.id,
            merchant_id=DEMO_IDS["merchant_two"],
            category_id=DEMO_IDS["cat_noodle"],
            name="菌菇鸡汤面",
            description=(
                "演示生成：依据林语餐厅粉面类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            item_type=ItemType.DISH,
            price_cents=1400,
            image_url="/dishes/noodles.svg",
            tags=["清淡", "汤面"],
        ),
        MenuItem(
            id=DEMO_IDS["item_four"],
            campus_id=campus.id,
            merchant_id=DEMO_IDS["merchant_three"],
            category_id=DEMO_IDS["cat_light"],
            name="鸡胸时蔬能量碗",
            description=(
                "演示生成：依据林苑餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            item_type=ItemType.COMBO,
            price_cents=1800,
            image_url="/dishes/energy-bowl.svg",
            tags=["高蛋白", "清淡"],
        ),
    ]
    admin = User(
        username="admin",
        email="admin@example.com",
        password_hash=hash_password("Admin123!"),
        role=UserRole.SUPER_ADMIN,
        is_active=True,
        email_verified=True,
    )
    demo_user = User(
        username="demo",
        email="demo@example.com",
        password_hash=hash_password("Demo123!"),
        role=UserRole.USER,
        is_active=True,
        email_verified=True,
    )
    reviewer_password_hash = hash_password("DemoReviewer123!")
    reviewers = [
        User(
            id=DEMO_IDS[reviewer_id],
            username=username,
            email=f"{username}@example.com",
            password_hash=reviewer_password_hash,
            role=UserRole.USER,
            is_active=True,
            email_verified=True,
        )
        for reviewer_id, username in [
            ("reviewer_one", "foodie_lin"),
            ("reviewer_two", "foodie_chen"),
            ("reviewer_three", "foodie_zhou"),
            ("reviewer_four", "foodie_wu"),
            ("reviewer_five", "foodie_song"),
            ("reviewer_six", "foodie_he"),
        ]
    ]
    review_samples = [
        (
            DEMO_IDS["item_one"],
            [
                (5, "牛腩炖得很软，番茄汁拌饭很香。"),
                (5, "酸甜度刚好，午餐吃很满足。"),
                (4, "分量足，蔬菜再多一点就更好了。"),
                (5, "出餐很快，牛腩没有肥腻感。"),
                (4, "味道家常，米饭软硬合适。"),
                (5, "番茄味浓，属于会回购的套餐。"),
            ],
        ),
        (
            DEMO_IDS["item_two"],
            [
                (4, "鸡腿肉嫩，微辣口味很下饭。"),
                (5, "去骨鸡腿吃起来方便，配菜也新鲜。"),
                (4, "辣度友好，整体分量适中。"),
                (4, "高峰期出餐仍然很快。"),
                (5, "鸡腿外焦里嫩，套餐搭配均衡。"),
                (4, "香辣但不油，适合工作日午餐。"),
            ],
        ),
        (
            DEMO_IDS["item_three"],
            [
                (5, "鸡汤鲜而不咸，菌菇很有香气。"),
                (4, "面条筋道，清淡口味很舒服。"),
                (5, "天气凉的时候吃一碗很暖胃。"),
                (5, "汤底自然，配料也很足。"),
                (4, "整体清爽，面量对女生很合适。"),
                (5, "菌菇和鸡汤很搭，会再次点。"),
            ],
        ),
        (
            DEMO_IDS["item_four"],
            [
                (5, "鸡胸不柴，糙米和蔬菜搭配丰富。"),
                (5, "吃完很有饱腹感，负担又不重。"),
                (5, "照烧汁甜度合适，牛油果很新鲜。"),
                (4, "食材丰富，价格稍高但可以接受。"),
                (5, "健身后吃很合适，蛋白质充足。"),
                (5, "颜色和口感都很好，推荐轻食党。"),
            ],
        ),
    ]
    reviews = [
        Review(
            campus_id=campus.id,
            user_id=reviewer.id,
            menu_item_id=menu_item_id,
            rating=rating,
            text=f"演示评价（非真实用户评价）：{text}",
            images=[],
            status=ReviewStatus.PUBLISHED,
        )
        for menu_item_id, samples in review_samples
        for reviewer, (rating, text) in zip(reviewers, samples, strict=True)
    ]
    # The models intentionally do not define ORM relationships, so SQLAlchemy's
    # unit of work cannot infer every insert dependency from Python object
    # references.  Flush each foreign-key layer explicitly; this is especially
    # important for SQLite with foreign-key enforcement enabled and for the
    # self-referential area/category hierarchies.
    db.add(campus)
    db.flush()

    db.add_all(
        [
            areas[0],
            areas[2],
            categories[0],
            categories[3],
            *tags,
            admin,
            demo_user,
            *reviewers,
        ]
    )
    db.flush()

    db.add_all([areas[1], categories[1], categories[2]])
    db.flush()

    db.add_all(merchants)
    db.flush()

    db.add_all(items)
    db.flush()

    db.add_all(reviews)
    db.flush()
    for item in items:
        recalculate_item_rating(db, item.id)

    db.add(
        UserProfile(
            user_id=demo_user.id,
            preferences={
                "campus_id": campus.id,
                "tastes": ["清淡", "高蛋白"],
                "avoid": [],
                "frequent_area_ids": [],
            },
        )
    )
    db.commit()
    _seed_extended_catalog(db)


def _refresh_core_demo_catalog(db: Session) -> None:
    campus = db.get(Campus, DEMO_IDS["campus"])
    if campus is None:
        return
    campus.name = "中南林业科技大学"
    campus.center_latitude = 28.134945
    campus.center_longitude = 112.989306

    area_names = {
        DEMO_IDS["area_north"]: "东园餐饮区",
        DEMO_IDS["area_north_first"]: "林海餐厅及周边档口",
        DEMO_IDS["area_south"]: "西园及后街餐饮区",
    }
    for area_id, name in area_names.items():
        area = db.get(CampusArea, area_id)
        if area is not None:
            area.name = name

    merchant_specs = {
        DEMO_IDS["merchant_one"]: {
            "area_id": DEMO_IDS["area_north_first"],
            "category_id": DEMO_IDS["cat_rice"],
            "name": "中南林业科技大学林海餐厅",
            "description": (
                "地点信息来自高德 POI B0FFK85GDN（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            "address": "青园路357号东北80米",
            "latitude": 28.135160,
            "longitude": 112.989410,
            "gcj02_latitude": 28.131782,
            "gcj02_longitude": 112.995009,
            "price_level": 1,
            "business_hours": "07:00-21:00",
        },
        DEMO_IDS["merchant_two"]: {
            "area_id": DEMO_IDS["area_north"],
            "category_id": DEMO_IDS["cat_noodle"],
            "name": "林语餐厅",
            "description": (
                "地点信息来自高德 POI B0FFHS6IE6（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            "address": "中南林业科技大学林大路105号(近常青公寓)",
            "latitude": 28.136507,
            "longitude": 112.988280,
            "gcj02_latitude": 28.133125,
            "gcj02_longitude": 112.993875,
            "price_level": 1,
            "business_hours": "07:00-21:00",
        },
        DEMO_IDS["merchant_three"]: {
            "area_id": DEMO_IDS["area_south"],
            "category_id": DEMO_IDS["cat_light"],
            "name": "中南林业科技大学林苑餐厅",
            "description": (
                "地点信息来自高德 POI B0FFH6K3IJ（2026-07-22 查询）；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            "address": "中南林业科技大学北门南220米",
            "latitude": 28.133670,
            "longitude": 112.987409,
            "gcj02_latitude": 28.130286,
            "gcj02_longitude": 112.993001,
            "price_level": 1,
            "business_hours": "07:00-21:00",
        },
    }
    for merchant_id, values in merchant_specs.items():
        merchant = db.get(Merchant, merchant_id)
        if merchant is not None:
            for field, value in values.items():
                setattr(merchant, field, value)

    item_specs = {
        DEMO_IDS["item_one"]: {
            "name": "番茄牛腩饭",
            "description": (
                "演示生成：依据林海餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            "price_cents": 1800,
            "image_url": "/dishes/rice-bowl.svg",
            "tags": ["酸甜", "高蛋白", "米饭"],
        },
        DEMO_IDS["item_two"]: {
            "name": "香辣鸡扒饭",
            "description": (
                "演示生成：依据林海餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            "price_cents": 1650,
            "image_url": "/dishes/energy-bowl.svg",
            "tags": ["微辣", "高蛋白"],
        },
        DEMO_IDS["item_three"]: {
            "name": "菌菇鸡汤面",
            "description": (
                "演示生成：依据林语餐厅粉面类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            "price_cents": 1400,
            "image_url": "/dishes/noodles.svg",
            "tags": ["清淡", "汤面"],
        },
        DEMO_IDS["item_four"]: {
            "name": "鸡胸时蔬能量碗",
            "description": (
                "演示生成：依据林苑餐厅综合餐饮类型构造，并非门店实测菜单；"
                "实际菜名、配料、价格和供应情况以现场为准。"
            ),
            "price_cents": 1800,
            "image_url": "/dishes/energy-bowl.svg",
            "tags": ["高蛋白", "清淡"],
        },
    }
    core_item_ids = set(item_specs)
    for item_id, values in item_specs.items():
        item = db.get(MenuItem, item_id)
        if item is not None:
            for field, value in values.items():
                setattr(item, field, value)

    seeded_reviewer_ids = {
        DEMO_IDS[f"reviewer_{name}"]
        for name in ("one", "two", "three", "four", "five", "six")
    }
    reviews = db.scalars(
        select(Review).where(
            Review.menu_item_id.in_(core_item_ids),
            Review.user_id.in_(seeded_reviewer_ids),
        )
    ).all()
    for review in reviews:
        item = db.get(MenuItem, review.menu_item_id)
        if item is not None:
            review.text = (
                f"演示评价（非真实用户评价）：{item.name}口味与分量适合日常用餐，"
                "实际体验请以现场为准。"
            )
            review.status = ReviewStatus.PUBLISHED
    db.flush()


_EXTENDED_TAGS: tuple[tuple[str, str], ...] = (
    ("香辣", "taste"),
    ("咸鲜", "taste"),
    ("甜口", "taste"),
    ("酥脆", "taste"),
    ("暖胃", "taste"),
    ("粉面", "category"),
    ("小吃", "category"),
    ("火锅烧烤", "category"),
    ("甜品", "category"),
    ("饮品", "category"),
)

_CATEGORY_IDS = {
    "rice": DEMO_IDS["cat_rice"],
    "noodle": DEMO_IDS["cat_noodle"],
    "light": DEMO_IDS["cat_light"],
    "snack": DEMO_IDS["cat_snack"],
    "hotpot": DEMO_IDS["cat_hotpot"],
    "drink": DEMO_IDS["cat_drink"],
}

_AREA_IDS = {
    "north": DEMO_IDS["area_north"],
    "north_first": DEMO_IDS["area_north_first"],
    "south": DEMO_IDS["area_south"],
}

_IMAGE_BY_CATEGORY = {
    "rice": "/dishes/rice-bowl.svg",
    "noodle": "/dishes/noodles.svg",
    "light": "/dishes/energy-bowl.svg",
    "snack": "/dishes/bagel.svg",
    "hotpot": "/dishes/skewers.svg",
    "drink": "/dishes/cold-brew.svg",
}


def _stable_seed_id(kind: str, key: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://campus-foodie.local/seed/{kind}/{key}"))


def _item_tags(name: str, category_key: str) -> list[str]:
    base_tags = {
        "rice": ["米饭", "咸鲜"],
        "noodle": ["粉面", "暖胃"],
        "light": ["清淡", "暖胃"],
        "snack": ["小吃"],
        "hotpot": ["火锅烧烤", "咸鲜"],
        "drink": ["饮品", "清爽"],
    }
    tags = list(base_tags[category_key])
    if any(marker in name for marker in ("辣", "螺蛳", "牛蛙", "干锅", "抄手")):
        tags.extend(["微辣", "香辣"])
    if any(
        marker in name
        for marker in ("糖", "奶", "甜", "豆花", "芋圆", "糍粑", "水果", "贝果")
    ):
        tags.append("甜口")
    if any(marker in name for marker in ("脆", "炸", "煎", "烤", "饼", "锅包")):
        tags.append("酥脆")
    if any(
        marker in name
        for marker in ("鸡", "牛", "肉", "鱼", "鸭", "蛙", "排骨", "猪蹄", "鹅")
    ):
        tags.append("高蛋白")
    if any(marker in name for marker in ("凉", "水果", "泡菜", "豆花", "椰汁")):
        tags.append("清爽")
    return list(dict.fromkeys(tags))


def _item_type(name: str, category_key: str) -> str:
    if category_key == "rice" or any(
        marker in name for marker in ("套餐", "拌饭", "煲仔饭", "双拼")
    ):
        return ItemType.COMBO
    return ItemType.DISH


def _review_text(item: MenuItem) -> str:
    if "甜口" in item.tags:
        detail = "甜度适中，适合作为课间补充"
    elif "香辣" in item.tags:
        detail = "香辣开胃，辣度对大多数同学比较友好"
    elif "暖胃" in item.tags:
        detail = "热乎顺口，出餐速度也不错"
    elif "酥脆" in item.tags:
        detail = "外层酥香，趁热吃口感更好"
    else:
        detail = "口味稳定，分量适合日常用餐"
    return f"演示评价（非真实用户评价）：{item.name}{detail}。"


def _seed_extended_catalog(db: Session) -> None:
    extra_categories = (
        Category(
            id=DEMO_IDS["cat_snack"],
            campus_id=DEMO_IDS["campus"],
            parent_id=DEMO_IDS["cat_chinese"],
            name="小吃烘焙",
            icon="cookie",
        ),
        Category(
            id=DEMO_IDS["cat_hotpot"],
            campus_id=DEMO_IDS["campus"],
            parent_id=DEMO_IDS["cat_chinese"],
            name="火锅烧烤",
            icon="flame",
        ),
        Category(
            id=DEMO_IDS["cat_drink"],
            campus_id=DEMO_IDS["campus"],
            parent_id=DEMO_IDS["cat_light"],
            name="饮品甜品",
            icon="cup",
        ),
    )
    for category in extra_categories:
        existing = db.get(Category, category.id)
        if existing is None:
            db.add(category)
        else:
            existing.parent_id = category.parent_id
            existing.name = category.name
            existing.icon = category.icon

    existing_tags = set(
        db.scalars(
            select(Tag.name).where(Tag.campus_id == DEMO_IDS["campus"])
        ).all()
    )
    db.add_all(
        Tag(campus_id=DEMO_IDS["campus"], name=name, kind=kind)
        for name, kind in _EXTENDED_TAGS
        if name not in existing_tags
    )
    db.flush()

    merchant_ids: dict[str, str] = {}
    for group in EXTENDED_CATALOG:
        merchant_id = _stable_seed_id("merchant", group.key)
        merchant_ids[group.key] = merchant_id
        values = {
            "campus_id": DEMO_IDS["campus"],
            "area_id": _AREA_IDS[group.area_key],
            "category_id": _CATEGORY_IDS[group.category_key],
            "name": group.name,
            "description": (
                f"地点信息来自{group.source_note}；"
                "菜单、价格、营业时间和评价均为演示生成，以现场公示为准。"
            ),
            "address": group.address,
            "latitude": group.latitude,
            "longitude": group.longitude,
            "gcj02_latitude": group.gcj02_latitude,
            "gcj02_longitude": group.gcj02_longitude,
            "price_level": group.price_level,
            "business_hours": group.business_hours,
            "is_active": True,
        }
        merchant = db.get(Merchant, merchant_id)
        if merchant is None:
            merchant = Merchant(
                id=merchant_id,
                **values,
            )
            db.add(merchant)
        else:
            for field, value in values.items():
                setattr(merchant, field, value)
    db.flush()

    seeded_items: list[MenuItem] = []
    for group in EXTENDED_CATALOG:
        for seed_item in group.items:
            item_id = _stable_seed_id(
                "menu-item", f"{group.key}:{seed_item.stable_key}"
            )
            values = {
                "campus_id": DEMO_IDS["campus"],
                "merchant_id": merchant_ids[group.key],
                "category_id": _CATEGORY_IDS[seed_item.category_key],
                "name": seed_item.name,
                "description": (
                    f"演示生成：依据 {group.name} 的地点类型构造，并非门店实测菜单；"
                    "实际菜名、配料、价格和供应情况以现场为准。"
                ),
                "item_type": _item_type(seed_item.name, seed_item.category_key),
                "price_cents": seed_item.price_cents,
                "image_url": _IMAGE_BY_CATEGORY[seed_item.category_key],
                "tags": _item_tags(seed_item.name, seed_item.category_key),
                "is_active": True,
            }
            item = db.get(MenuItem, item_id)
            if item is None:
                item = MenuItem(id=item_id, **values)
                db.add(item)
            else:
                for field, value in values.items():
                    setattr(item, field, value)
            seeded_items.append(item)
    db.flush()

    reviewer_ids = [
        DEMO_IDS[f"reviewer_{name}"]
        for name in ("one", "two", "three", "four", "five", "six")
    ]
    available_reviewer_ids = [
        reviewer_id for reviewer_id in reviewer_ids if db.get(User, reviewer_id) is not None
    ]
    if available_reviewer_ids:
        for index, item in enumerate(seeded_items):
            reviewer_id = available_reviewer_ids[index % len(available_reviewer_ids)]
            review = db.scalar(
                select(Review).where(
                    Review.user_id == reviewer_id,
                    Review.menu_item_id == item.id,
                )
            )
            if review is None:
                review = Review(
                    campus_id=DEMO_IDS["campus"],
                    user_id=reviewer_id,
                    menu_item_id=item.id,
                    rating=4,
                    text=_review_text(item),
                    images=[],
                    status=ReviewStatus.PUBLISHED,
                )
                db.add(review)
            else:
                review.rating = 4
                review.text = _review_text(item)
                review.images = []
                review.status = ReviewStatus.PUBLISHED
                review.moderation_reason = None
                review.deleted_at = None
        db.flush()

    all_item_ids = db.scalars(
        select(MenuItem.id).where(MenuItem.campus_id == DEMO_IDS["campus"])
    ).all()
    for item_id in all_item_ids:
        recalculate_item_rating(db, item_id)
    db.commit()
