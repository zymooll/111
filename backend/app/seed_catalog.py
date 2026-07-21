from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SeedMenuItem:
    stable_key: str
    name: str
    price_cents: int
    category_key: str


@dataclass(frozen=True)
class SeedMerchantGroup:
    key: str
    name: str
    area_key: str
    address: str
    latitude: float
    longitude: float
    gcj02_latitude: float
    gcj02_longitude: float
    category_key: str
    price_level: int
    business_hours: str
    source_note: str
    items: tuple[SeedMenuItem, ...]


# Merchant names, addresses and GCJ-02 positions come from AMap place search on
# 2026-07-22. WGS-84 positions were solved against AMap's GPS-to-GCJ converter.
# Menu names, prices, descriptions, opening hours and reviews are demo content.
EXTENDED_CATALOG: tuple[SeedMerchantGroup, ...] = (
    SeedMerchantGroup(
        key="linda-campus-flavors",
        name="林涛餐厅",
        area_key="south",
        address="中南林业科技大学西园14栋",
        latitude=28.133036,
        longitude=112.984693,
        gcj02_latitude=28.129644,
        gcj02_longitude=112.990275,
        category_key="rice",
        price_level=1,
        business_hours="07:00-21:00",
        source_note="高德 POI B0FFIIUFLZ（2026-07-22 查询）",
        items=(
            SeedMenuItem("重庆小面", "新奥尔良鸡扒饭", 1600, "rice"),
            SeedMenuItem("自制豆浆", "林涛照烧鸡腿饭", 1700, "rice"),
            SeedMenuItem("鲜肉馄饨", "千里香馄饨", 1200, "noodle"),
            SeedMenuItem("手工水饺", "林涛红油抄手", 1200, "noodle"),
            SeedMenuItem("铁板鸡排", "葱油拌面", 1000, "noodle"),
            SeedMenuItem("荷叶炒饭", "鸡蛋灌饼", 800, "snack"),
            SeedMenuItem("肉夹馍", "紫菜蛋花汤", 600, "light"),
            SeedMenuItem("千里香馄饨", "香辣小火锅", 2200, "hotpot"),
            SeedMenuItem("新奥尔良烤肉饭", "柠檬蜂蜜茶", 800, "drink"),
            SeedMenuItem("骨汤麻辣烫", "土豆烧鸡盖饭", 1600, "rice"),
            SeedMenuItem("福州煨汤", "鲜肉蒸饺", 900, "snack"),
            SeedMenuItem("一荤一素套餐", "冬瓜排骨汤", 900, "light"),
        ),
    ),
    SeedMerchantGroup(
        key="linda-backstreet",
        name="林冠餐厅",
        area_key="south",
        address="韶山南路498号中南林业科技大学",
        latitude=28.132689,
        longitude=112.984888,
        gcj02_latitude=28.129298,
        gcj02_longitude=112.990471,
        category_key="rice",
        price_level=1,
        business_hours="07:00-21:00",
        source_note="高德 POI B0FFIZQWMY（2026-07-22 查询）",
        items=(
            SeedMenuItem("螺蛳粉", "林冠一荤一素套餐", 1300, "rice"),
            SeedMenuItem("酸笋腐竹螺蛳粉", "林冠卤肉盖饭", 1600, "rice"),
            SeedMenuItem("甘梅脆皮玉米", "林冠骨汤麻辣烫", 1800, "hotpot"),
            SeedMenuItem("椒盐脆皮玉米", "林冠福州煨汤", 1100, "light"),
            SeedMenuItem("掉渣饼加蛋生菜", "玉米排骨煨汤", 1000, "light"),
            SeedMenuItem("全家福掉渣饼", "沙县花生酱拌面", 1000, "noodle"),
            SeedMenuItem("烤冷面", "香酥鸡柳", 900, "snack"),
            SeedMenuItem("蛋包饭", "红糖糍粑", 1000, "snack"),
            SeedMenuItem("波霸奶绿", "绿豆沙", 700, "drink"),
            SeedMenuItem("果木烤鸭", "香菇滑鸡饭", 1500, "rice"),
            SeedMenuItem("麻辣牛肉粉", "林冠酸辣粉", 1100, "noodle"),
            SeedMenuItem("花甲粉", "蒸蛋肉饼套餐", 1500, "rice"),
        ),
    ),
    SeedMerchantGroup(
        key="tingxiang-food-hall",
        name="中南林业科技大学学生五食堂",
        area_key="south",
        address="韶山南路498号中南林业科技大学",
        latitude=28.133509,
        longitude=112.987289,
        gcj02_latitude=28.130124,
        gcj02_longitude=112.992881,
        category_key="rice",
        price_level=1,
        business_hours="07:00-21:00",
        source_note="高德 POI B0FFMEZBBV（2026-07-22 查询）",
        items=(
            SeedMenuItem("两荤一素套餐", "辣椒炒肉盖码饭", 1600, "rice"),
            SeedMenuItem("汀香螺蛳粉", "黄焖鸡米饭", 1700, "rice"),
            SeedMenuItem("兰花干子", "五食堂番茄鸡蛋面", 1100, "noodle"),
            SeedMenuItem("咕噜鱼饭", "牛肉汤粉", 1400, "noodle"),
            SeedMenuItem("烤肉拌饭", "鸡胸杂粮时蔬碗", 1800, "light"),
            SeedMenuItem("悠悠卤粉", "蔬菜豆腐汤", 700, "light"),
            SeedMenuItem("F+牛肉饭", "奥尔良烤翅", 1400, "hotpot"),
            SeedMenuItem("窝子面", "酱香饼", 700, "snack"),
            SeedMenuItem("砂锅粉", "西瓜汁", 900, "drink"),
            SeedMenuItem("麻辣香锅", "香干回锅肉盖饭", 1600, "rice"),
            SeedMenuItem("煲仔饭", "红油水饺", 1200, "noodle"),
            SeedMenuItem("排骨粉", "南瓜小米粥", 600, "light"),
        ),
    ),
    SeedMerchantGroup(
        key="yuntang-south-gate",
        name="匠心卤(中南林业科技大学林海餐厅店)",
        area_key="north_first",
        address="韶山南路498号中南林业科技大学林海食堂",
        latitude=28.135180,
        longitude=112.989270,
        gcj02_latitude=28.131801,
        gcj02_longitude=112.994869,
        category_key="rice",
        price_level=1,
        business_hours="10:00-21:00",
        source_note="高德 POI B0MALH6ZI7（2026-07-22 查询）",
        items=(
            SeedMenuItem("西门烤面筋", "卤香肉饭", 1600, "rice"),
            SeedMenuItem("杨枝甘露烧仙草", "匠心卤双拼饭", 2000, "rice"),
            SeedMenuItem("凉皮", "卤鸡腿饭", 1800, "rice"),
            SeedMenuItem("秘制麻酱凉面", "香辣卤粉", 1400, "noodle"),
            SeedMenuItem("烤红薯", "卤味拌面", 1400, "noodle"),
            SeedMenuItem("油炸鸭架", "卤味拼盘", 2200, "snack"),
            SeedMenuItem("招牌牛蛙", "卤蛋豆干小拼", 1000, "snack"),
            SeedMenuItem("黑米糍粑", "冬瓜海带汤", 600, "light"),
            SeedMenuItem("现拌五花肉", "卤鸭腿饭", 1900, "rice"),
            SeedMenuItem("黑椒牛仔骨", "香卤牛肉粉", 1600, "noodle"),
            SeedMenuItem("红糖糍粑", "卤鸡爪", 1200, "snack"),
            SeedMenuItem("鸡翅干锅", "紫菜虾皮汤", 600, "light"),
        ),
    ),
    SeedMerchantGroup(
        key="jinpenling-food-street",
        name="瑞幸咖啡(中南林业科技大学林旺百货店)",
        area_key="north_first",
        address="文源街道芙蓉南路496号中南林业科技大学林海餐厅二楼",
        latitude=28.135504,
        longitude=112.989176,
        gcj02_latitude=28.132125,
        gcj02_longitude=112.994775,
        category_key="drink",
        price_level=2,
        business_hours="08:00-21:30",
        source_note="高德 POI B0GKSAI3KY（2026-07-22 查询）",
        items=(
            SeedMenuItem("肥肠干锅", "瑞幸经典拿铁", 1500, "drink"),
            SeedMenuItem("黄焖鸡米饭", "瑞幸生椰风味拿铁", 1800, "drink"),
            SeedMenuItem("石锅鱼", "瑞幸美式咖啡", 1300, "drink"),
            SeedMenuItem("杂粮煎饼", "瑞幸燕麦拿铁", 1800, "drink"),
            SeedMenuItem("番茄鸡蛋汤面", "瑞幸抹茶风味拿铁", 1700, "drink"),
            SeedMenuItem("肉末干捞粉", "瑞幸柚香气泡饮", 1600, "drink"),
            SeedMenuItem("排骨码子碱面", "瑞幸蓝莓酸奶杯", 1400, "drink"),
            SeedMenuItem("醉鹅", "瑞幸火腿芝士可颂", 1500, "snack"),
            SeedMenuItem("擂辣椒皮蛋", "瑞幸厚乳拿铁", 1700, "drink"),
            SeedMenuItem("香煎小黄鱼", "瑞幸柠檬冷萃", 1600, "drink"),
        ),
    ),
    SeedMerchantGroup(
        key="zhilan-fengze",
        name="库迪咖啡(中南林业科技大学店)",
        area_key="north_first",
        address="文源街道林大路中南林业科技大学林海餐厅1层",
        latitude=28.135559,
        longitude=112.989012,
        gcj02_latitude=28.132179,
        gcj02_longitude=112.994610,
        category_key="drink",
        price_level=2,
        business_hours="08:00-21:30",
        source_note="高德 POI B0L6FAAQ9B（2026-07-22 查询）",
        items=(
            SeedMenuItem("红烧牛肉圆粉", "库迪经典美式", 1200, "drink"),
            SeedMenuItem("牛肉汤", "库迪厚乳拿铁", 1600, "drink"),
            SeedMenuItem("梅干菜扣肉饼", "库迪厚椰风味拿铁", 1700, "drink"),
            SeedMenuItem("片皮烤鸭", "库迪摩卡咖啡", 1700, "drink"),
            SeedMenuItem("卤汁拌饭", "库迪茉莉奶绿", 1400, "drink"),
            SeedMenuItem("豆花", "库迪柠檬气泡水", 1400, "drink"),
            SeedMenuItem("芋圆椰汁", "库迪芝士贝果", 1200, "snack"),
            SeedMenuItem("麻辣抄手", "库迪鸡肉全麦卷", 1600, "light"),
            SeedMenuItem("怀化风味泡菜", "库迪香草拿铁", 1600, "drink"),
            SeedMenuItem("生煎包", "库迪葡萄冰茶", 1500, "drink"),
        ),
    ),
    SeedMerchantGroup(
        key="huxiang-canteen-selection",
        name="螺蛳粉-林科大后街店",
        area_key="south",
        address="中南林业科技大学西园临街A栋5号(香溢豪庭小区对门)",
        latitude=28.135664,
        longitude=112.986697,
        gcj02_latitude=28.132277,
        gcj02_longitude=112.992287,
        category_key="noodle",
        price_level=1,
        business_hours="10:00-22:00",
        source_note="高德 POI B0LGDRJ511（2026-07-22 查询）",
        items=(
            SeedMenuItem("荷叶饭", "原味螺蛳粉", 1300, "noodle"),
            SeedMenuItem("卤肉饭", "酸笋腐竹螺蛳粉", 1500, "noodle"),
            SeedMenuItem("水果捞", "番茄螺蛳粉", 1600, "noodle"),
            SeedMenuItem("浏阳蒸菜", "干捞螺蛳粉", 1500, "noodle"),
            SeedMenuItem("常德牛肉面", "炸蛋螺蛳粉", 1800, "noodle"),
            SeedMenuItem("瓦罐汤", "鸭脚螺蛳粉", 2000, "noodle"),
            SeedMenuItem("匠心卤双拼", "香炸腐竹", 800, "snack"),
            SeedMenuItem("招牌精品五花肉", "冰豆花", 800, "drink"),
            SeedMenuItem("馋嘴蛙", "牛腩螺蛳粉", 2000, "noodle"),
            SeedMenuItem("酱汁猪蹄火锅", "虎皮猪脚螺蛳粉", 2200, "noodle"),
            SeedMenuItem("片片鱼", "螺蛳粉配卤蛋套餐", 1700, "noodle"),
            SeedMenuItem("乌鱼水饺", "酸梅汤", 700, "drink"),
        ),
    ),
    SeedMerchantGroup(
        key="tianma-lushan",
        name="香味居过桥米线(林大西门店)",
        area_key="south",
        address="中南林业科技大学西园后街青园路338号13号门面",
        latitude=28.135842,
        longitude=112.987522,
        gcj02_latitude=28.132458,
        gcj02_longitude=112.993115,
        category_key="noodle",
        price_level=1,
        business_hours="10:00-22:00",
        source_note="高德 POI B02DB0VW0Z（2026-07-22 查询）",
        items=(
            SeedMenuItem("糖醋鱼", "原味过桥米线", 1400, "noodle"),
            SeedMenuItem("菠萝排骨", "番茄肥牛米线", 1800, "noodle"),
            SeedMenuItem("锅包肉", "酸菜鱼片米线", 1800, "noodle"),
            SeedMenuItem("辣椒炒肉", "麻辣牛肉米线", 1800, "noodle"),
            SeedMenuItem("臭豆腐", "菌菇鸡汤米线", 1600, "noodle"),
            SeedMenuItem("牛肉饼", "金汤肥牛米线", 1900, "noodle"),
            SeedMenuItem("糖油粑粑", "砂锅土豆粉", 1500, "noodle"),
            SeedMenuItem("地狱拉面", "香味居香酥鸡排", 1200, "snack"),
            SeedMenuItem("凯撒卷", "桂花冰粉", 800, "drink"),
            SeedMenuItem("紫菜包饭", "酸汤肉片米线", 1800, "noodle"),
            SeedMenuItem("贝果", "鲜蔬米线", 1300, "noodle"),
            SeedMenuItem("红油抄手", "红糖凉糕", 800, "drink"),
        ),
    ),
)


EXTENDED_ITEM_COUNT = sum(len(group.items) for group in EXTENDED_CATALOG)
