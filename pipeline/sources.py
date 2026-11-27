"""Download public source snapshots into a local, reusable cache."""

import argparse
import concurrent.futures
import json
import shutil
import time
import urllib.request
from pathlib import Path

NATURAL_EARTH = "https://naturalearth.s3.amazonaws.com/"
GHSL = "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/"
POPULATION_NAME = "GHS_POP_E2020_GLOBE_R2023A_54009_1000"
URLS = {
    "atlas-country.zip": NATURAL_EARTH + "10m_cultural/ne_10m_admin_0_countries.zip",
    "atlas-rivers.zip": NATURAL_EARTH + "50m_physical/ne_50m_rivers_lake_centerlines.zip",
    "atlas-lakes.zip": NATURAL_EARTH + "50m_physical/ne_50m_lakes.zip",
    "ports.zip": NATURAL_EARTH + "10m_cultural/ne_10m_ports.zip",
    "places.zip": NATURAL_EARTH + "10m_cultural/ne_10m_populated_places.zip",
    "glaciers.zip": NATURAL_EARTH + "50m_physical/ne_50m_glaciated_areas.zip",
    "relief.grd": "https://oceania.generic-mapping-tools.org/server/earth/earth_relief/earth_relief_06m_g.grd",
    "population.zip": GHSL + f"GHS_POP_GLOBE_R2023A/{POPULATION_NAME}/V1-0/{POPULATION_NAME}_V1_0.zip",
    "biomes.zip": "https://storage.googleapis.com/teow2016/Ecoregions2017.zip",
    "cities500.zip": "https://download.geonames.org/export/dump/cities500.zip",
    "airports.csv": "https://davidmegginson.github.io/ourairports-data/airports.csv",
    "power.zip": "https://wri-dataportal-prod.s3.amazonaws.com/manual/global_power_plant_database_v_1_3.zip",
    "regions.json": "https://api.worldbank.org/v2/country?format=json&per_page=400",
    "heritage.json": "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/exports/json",
}

# Annual indicator ids are also the keys in the browser data contract.
INDICATORS = [
    ("pop", "SP.POP.TOTL", "人口", "人", "人口", "total", "年中人口估计。"),
    ("urban", "SP.URB.TOTL.IN.ZS", "城市人口", "%", "人口", "percent", "城市人口占比。城市分类采用各统计经济体定义。"),
    ("working", "SP.POP.1564.TO.ZS", "劳动年龄人口", "%", "人口", "percent", "15–64 岁人口占总人口的比例。"),
    ("elderly", "SP.POP.65UP.TO.ZS", "老龄人口", "%", "人口", "percent", "65 岁及以上人口占比。"),
    ("female", "SP.POP.TOTL.FE.ZS", "女性人口", "%", "人口", "percent", "女性人口占总人口的比例。"),
    ("fertility", "SP.DYN.TFRT.IN", "总和生育率", "人/女性", "人口", "linear", "按当前年龄别生育率计算的每名女性预期生育数。"),
    ("gdp", "NY.GDP.MKTP.CD", "经济总量", "美元", "经济", "total", "按当年汇率换算的名义 GDP。"),
    ("gdpReal", "NY.GDP.MKTP.KD", "实际经济总量", "2015 年美元", "经济", "total", "以 2015 年美元计价的实际 GDP。"),
    ("income", "NY.GDP.PCAP.CD", "人均 GDP", "美元/人", "经济", "total", "名义 GDP 除以年中人口。"),
    ("growth", "NY.GDP.MKTP.KD.ZG", "实际经济增长", "%", "经济", "diverging", "基于不变价格计算的 GDP 年变化率。"),
    ("industry", "NV.IND.TOTL.ZS", "工业增加值", "%", "经济", "percent", "工业（含建筑业）增加值占 GDP 比例。"),
    ("services", "NV.SRV.TOTL.ZS", "服务业增加值", "%", "经济", "percent", "服务业增加值占 GDP 比例。"),
    ("agriculture", "NV.AGR.TOTL.ZS", "农业增加值", "%", "经济", "percent", "农业、林业和渔业增加值占 GDP 比例。"),
    ("grain", "AG.PRD.CREL.MT", "谷物产量", "吨", "经济", "total", "收获的谷物干粮产量，单位为公吨，适用 FAO 统计定义。"),
    ("manufacture", "NV.IND.MANF.CD", "制造业增加值", "美元", "经济", "total", "制造业的净产出，以当年美元计。"),
    ("trade", "NE.TRD.GNFS.ZS", "贸易开放度", "%", "经济", "linear", "进出口合计占 GDP 比例。可能高于 100%。"),
    ("unemployment", "SL.UEM.TOTL.ZS", "失业率", "%", "经济", "percent", "失业人员占劳动力比例，ILO 模型估计。"),
    ("life", "SP.DYN.LE00.IN", "预期寿命", "岁", "民生", "linear", "按当前死亡率推算的新生儿预期寿命。"),
    ("school", "SE.SEC.ENRR", "中学注册率", "%", "民生", "linear", "中学全部在读人数与官方相应学龄人口的比值，可能高于 100%。"),
    ("net", "IT.NET.USER.ZS", "互联网使用", "%", "民生", "percent", "使用互联网的人口占比。"),
    ("water", "SH.H2O.BASW.ZS", "基本饮水服务", "%", "民生", "percent", "至少能使用基本饮水服务的人口比例。"),
    ("health", "SH.XPD.CHEX.GD.ZS", "卫生支出", "%", "民生", "percent", "当期卫生支出占 GDP 比例。"),
    ("electric", "EG.ELC.ACCS.ZS", "电力可及率", "%", "能源与环境", "percent", "可使用电力的人口比例。"),
    ("renew", "EG.FEC.RNEW.ZS", "可再生能源消费", "%", "能源与环境", "percent", "可再生能源占最终能源消费比例。"),
    ("energy", "EG.USE.ELEC.KH.PC", "人均用电量", "千瓦时/人", "能源与环境", "total", "人均年电力消费。"),
    ("co2", "EN.GHG.CO2.PC.CE.AR5", "人均二氧化碳", "吨/人", "能源与环境", "linear", "人均 CO₂ 排放，排除土地利用、土地利用变化和林业。"),
    ("forest", "AG.LND.FRST.ZS", "森林面积", "%", "能源与环境", "percent", "森林覆盖面积占陆地国土面积比例。"),
    ("cropland", "AG.LND.ARBL.ZS", "可耕地面积", "%", "能源与环境", "percent", "可耕地占陆地国土面积比例。"),
    ("research", "GB.XPD.RSDV.GD.ZS", "研发支出", "%", "民生", "percent", "研究与试验发展支出占 GDP 比例。"),
]


def fetch(cache: Path, name: str, url: str) -> Path:
    target = cache / name
    if target.exists() and target.stat().st_size:
        return target
    temporary = target.with_name(target.name + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "Orbis Atlas public-data pipeline/1.0"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=95) as response, temporary.open("wb") as stream:
                shutil.copyfileobj(response, stream, length=1024 * 1024)
            temporary.replace(target)
            print(f"{name}: {target.stat().st_size:,} B", flush=True)
            return target
        except OSError:
            if attempt == 1:
                raise
            time.sleep(1)
    raise RuntimeError(f"Download failed for {name}")


def download(cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    jobs = dict(URLS)
    jobs.update({
        f"wdi-{key}.zip": f"https://api.worldbank.org/v2/en/indicator/{code}?downloadformat=csv"
        for key, code, *_ in INDICATORS
    })
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch, cache, name, url): name for name, url in jobs.items()}
        errors = []
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except (OSError, RuntimeError) as error:
                errors.append(f"{futures[future]}: {error}")
        if errors:
            raise SystemExit("\n".join(errors))
    (cache / "sources.json").write_text(json.dumps(jobs, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path, default=Path(".cache"))
    download(parser.parse_args().cache)
