from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Campus,
    CampusArea,
    Category,
    ItemType,
    MenuItem,
    Merchant,
    Tag,
    User,
    UserProfile,
    UserRole,
)
from app.security import hash_password


DEMO_IDS = {
    "campus": "00000000-0000-0000-0000-000000000001",
    "area_north": "00000000-0000-0000-0000-000000000011",
    "area_north_first": "00000000-0000-0000-0000-000000000012",
    "area_south": "00000000-0000-0000-0000-000000000013",
    "cat_chinese": "00000000-0000-0000-0000-000000000021",
    "cat_rice": "00000000-0000-0000-0000-000000000022",
    "cat_noodle": "00000000-0000-0000-0000-000000000023",
    "cat_light": "00000000-0000-0000-0000-000000000024",
    "merchant_one": "00000000-0000-0000-0000-000000000031",
    "merchant_two": "00000000-0000-0000-0000-000000000032",
    "merchant_three": "00000000-0000-0000-0000-000000000033",
    "item_one": "00000000-0000-0000-0000-000000000041",
    "item_two": "00000000-0000-0000-0000-000000000042",
    "item_three": "00000000-0000-0000-0000-000000000043",
    "item_four": "00000000-0000-0000-0000-000000000044",
}


def seed_demo_data(db: Session) -> None:
    if db.scalar(select(Campus.id).limit(1)) is not None:
        return

    campus = Campus(
        id=DEMO_IDS["campus"],
        name="示范大学",
        center_latitude=31.2304,
        center_longitude=121.4737,
    )
    areas = [
        CampusArea(
            id=DEMO_IDS["area_north"], campus_id=campus.id, name="北区食堂", level=1
        ),
        CampusArea(
            id=DEMO_IDS["area_north_first"],
            campus_id=campus.id,
            parent_id=DEMO_IDS["area_north"],
            name="一楼风味档口",
            level=2,
        ),
        CampusArea(
            id=DEMO_IDS["area_south"], campus_id=campus.id, name="南区生活街", level=1
        ),
    ]
    categories = [
        Category(id=DEMO_IDS["cat_chinese"], name="中式餐饮", icon="bowl"),
        Category(
            id=DEMO_IDS["cat_rice"],
            parent_id=DEMO_IDS["cat_chinese"],
            name="米饭套餐",
            icon="rice",
        ),
        Category(
            id=DEMO_IDS["cat_noodle"],
            parent_id=DEMO_IDS["cat_chinese"],
            name="面食",
            icon="noodle",
        ),
        Category(id=DEMO_IDS["cat_light"], name="轻食饮品", icon="leaf"),
    ]
    tags = [
        Tag(name="微辣", kind="taste"),
        Tag(name="酸甜", kind="taste"),
        Tag(name="清淡", kind="taste"),
        Tag(name="高蛋白", kind="diet"),
        Tag(name="素食友好", kind="diet"),
    ]
    merchants = [
        Merchant(
            id=DEMO_IDS["merchant_one"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_north_first"],
            category_id=DEMO_IDS["cat_rice"],
            name="校园小炒",
            description="现点现炒的家常菜档口",
            address="北区食堂一楼 08 号",
            latitude=31.2304,
            longitude=121.4737,
            gcj02_latitude=31.2285,
            gcj02_longitude=121.4782,
            price_level=2,
            business_hours="10:30-20:30",
        ),
        Merchant(
            id=DEMO_IDS["merchant_two"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_north"],
            category_id=DEMO_IDS["cat_noodle"],
            name="麦香面馆",
            description="汤面、拌面和暖胃小食",
            address="北区食堂二楼 03 号",
            latitude=31.23045,
            longitude=121.47376,
            gcj02_latitude=31.22855,
            gcj02_longitude=121.47826,
            price_level=1,
            business_hours="07:00-21:00",
        ),
        Merchant(
            id=DEMO_IDS["merchant_three"],
            campus_id=campus.id,
            area_id=DEMO_IDS["area_south"],
            category_id=DEMO_IDS["cat_light"],
            name="轻食研究所",
            description="低负担沙拉、能量碗和鲜榨饮品",
            address="南区生活街 12 号",
            latitude=31.2291,
            longitude=121.4752,
            gcj02_latitude=31.2272,
            gcj02_longitude=121.4797,
            price_level=3,
            business_hours="09:00-20:00",
        ),
    ]
    items = [
        MenuItem(
            id=DEMO_IDS["item_one"],
            merchant_id=DEMO_IDS["merchant_one"],
            category_id=DEMO_IDS["cat_rice"],
            name="番茄牛腩饭",
            description="慢炖牛腩搭配酸甜番茄和时蔬",
            item_type=ItemType.COMBO,
            price_cents=1800,
            image_url="/dishes/rice-bowl.svg",
            rating_avg=4.8,
            review_count=23,
            tags=["酸甜", "高蛋白", "米饭"],
        ),
        MenuItem(
            id=DEMO_IDS["item_two"],
            merchant_id=DEMO_IDS["merchant_one"],
            category_id=DEMO_IDS["cat_rice"],
            name="香辣鸡腿套餐",
            description="去骨鸡腿配双份时蔬",
            item_type=ItemType.COMBO,
            price_cents=1650,
            image_url="/dishes/energy-bowl.svg",
            rating_avg=4.6,
            review_count=17,
            tags=["微辣", "高蛋白"],
        ),
        MenuItem(
            id=DEMO_IDS["item_three"],
            merchant_id=DEMO_IDS["merchant_two"],
            category_id=DEMO_IDS["cat_noodle"],
            name="菌菇鸡汤面",
            description="鲜香鸡汤、菌菇和手工面",
            item_type=ItemType.DISH,
            price_cents=1400,
            image_url="/dishes/noodles.svg",
            rating_avg=4.7,
            review_count=31,
            tags=["清淡", "汤面"],
        ),
        MenuItem(
            id=DEMO_IDS["item_four"],
            merchant_id=DEMO_IDS["merchant_three"],
            category_id=DEMO_IDS["cat_light"],
            name="照烧鸡能量碗",
            description="糙米、照烧鸡胸、牛油果和季节蔬菜",
            item_type=ItemType.COMBO,
            price_cents=2480,
            image_url="/dishes/energy-bowl.svg",
            rating_avg=4.9,
            review_count=12,
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
    # The models intentionally do not define ORM relationships, so SQLAlchemy's
    # unit of work cannot infer every insert dependency from Python object
    # references.  Flush each foreign-key layer explicitly; this is especially
    # important for SQLite with foreign-key enforcement enabled and for the
    # self-referential area/category hierarchies.
    db.add(campus)
    db.flush()

    db.add_all(
        [areas[0], areas[2], categories[0], categories[3], *tags, admin, demo_user]
    )
    db.flush()

    db.add_all([areas[1], categories[1], categories[2]])
    db.flush()

    db.add_all(merchants)
    db.flush()

    db.add_all(items)
    db.flush()
    db.add(UserProfile(user_id=demo_user.id, preferences={"tastes": ["清淡", "高蛋白"]}))
    db.commit()
